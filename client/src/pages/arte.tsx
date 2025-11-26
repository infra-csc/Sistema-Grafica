import { useQuery, useMutation } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, Eye, Calendar, Truck, Filter, Check, ChevronsUpDown, Search, Upload, FileImage, File, Clock, Package, ClipboardList, Send, FolderOpen, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ItemDetailsDialog } from "@/components/item-details-dialog";

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

  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs"],
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

  const convertGCSUrlToLocalPath = (gcsUrl: string): string => {
    // If it's already a local path, return as is
    if (gcsUrl.startsWith('/')) {
      return gcsUrl;
    }
    // Extract the file path from GCS URL
    const match = gcsUrl.match(/\/\.private\/(.+?)(?:\?|$)/);
    if (match) {
      const filePath = match[1];
      return `/api/objects/download/${encodeURIComponent(filePath)}`;
    }
    // If no match, return original URL
    return gcsUrl;
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
          matchesView = item.status === 'requested' || 
            item.status === 'awaiting_submission' ||
            (item.status === 'awaiting_sponsor_approval' && item.rejectedBySponsor === true);
        } else if (tab === "finalizar-layouts") {
          matchesView = item.status === 'sponsor_approved';
        } else if (tab === "finalizados") {
          matchesView = item.status === 'awaiting_final_review' || 
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
  const finalizadosCount = getFilteredItemsForTab("finalizados").length;

  const pendingItems = filteredItems.filter(item => item.status === 'requested' || item.status === 'awaiting_submission');

  const handleViewDetails = (item: any) => {
    setSelectedItem(item);
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
              onClick={() => setActiveTab("finalizados")}
              data-testid="tab-finalizados"
              className={cn(
                "inline-flex flex-col items-center justify-center whitespace-nowrap rounded-md px-6 py-3.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 flex-1 gap-2",
                activeTab === "finalizados"
                  ? "bg-background text-foreground shadow-md border-2 border-green-500"
                  : "text-foreground/70 hover-elevate"
              )}
            >
              <div className="flex items-center gap-2">
                <CheckCircle className={cn("h-4 w-4", activeTab === "finalizados" ? "text-green-600" : "text-green-500")} />
                <span className="font-semibold">Finalizados</span>
              </div>
              <Badge 
                className={cn(
                  "min-w-[28px] justify-center bg-green-600 text-white hover:bg-green-700",
                  activeTab !== "finalizados" && "bg-green-500/20 text-green-700 hover:bg-green-500/30"
                )}
              >
                {finalizadosCount}
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
                      <span className="truncate">
                        {eventFilter === "all" 
                          ? "Todos os eventos" 
                          : events.find((event) => event.id === eventFilter)?.name || "Selecione um evento"}
                      </span>
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
              {activeTab === "criar-aprovacoes" && (
                <Button
                  variant={selectedItemIds.size > 0 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowBulkDialog(true)}
                  disabled={selectedItemIds.size === 0}
                  data-testid="button-open-bulk-upload"
                >
                  <File className="h-4 w-4 mr-2" />
                  {selectedItemIds.size > 0 
                    ? `Upload PDF Compartilhado (${selectedItemIds.size})` 
                    : "Selecione itens para PDF"}
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
                  <p className="text-muted-foreground">Nenhum item finalizado encontrado</p>
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
            <div className="space-y-2">
              {(() => {
                const groups: { event: string; type: string; items: typeof filteredItems }[] = [];
                filteredItems.forEach(item => {
                  const eventName = item.event?.name || 'Sem Evento';
                  const typeName = item.type;
                  const lastGroup = groups[groups.length - 1];
                  if (lastGroup && lastGroup.event === eventName && lastGroup.type === typeName) {
                    lastGroup.items.push(item);
                  } else {
                    groups.push({ event: eventName, type: typeName, items: [item] });
                  }
                });
                return groups.map((group, groupIndex) => (
                  <Fragment key={`${group.event}-${group.type}-${groupIndex}`}>
                    {(groupIndex === 0 || groups[groupIndex - 1].event !== group.event) && (
                      <div className="bg-gradient-to-r from-primary/10 to-primary/5 border-l-4 border-primary rounded-md p-2 mt-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-bold text-primary uppercase tracking-wide">
                            {group.event}
                          </div>
                          {group.items[0].event && (
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                <span className="hidden sm:inline">Início: </span>
                                <strong className="text-foreground">{new Date(group.items[0].event.startDate).toLocaleDateString('pt-BR')}</strong>
                              </div>
                              <div className="flex items-center gap-1">
                                <Truck className="h-3 w-3" />
                                <span className="hidden sm:inline">Saída: </span>
                                <strong className="text-foreground">{new Date(group.items[0].event.truckDepartureDate).toLocaleDateString('pt-BR')} às {new Date(group.items[0].event.truckDepartureDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="mt-1 overflow-x-auto">
                      <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
                        <thead className="bg-muted/20">
                          {activeTab === "criar-aprovacoes" ? (
                            <>
                              <tr className="border-b border-border/30">
                                <th className="text-center py-1 px-2 w-10" rowSpan={2}>
                                  <Checkbox
                                    checked={selectedItemIds.size === pendingItems.length && pendingItems.length > 0}
                                    onCheckedChange={toggleAllSelection}
                                    data-testid="checkbox-select-all"
                                  />
                                </th>
                                <th colSpan={8} className="text-left py-1 px-2 font-semibold">
                                  {group.type}
                                </th>
                              </tr>
                              <tr className="border-b border-border/40">
                                <th className="text-left py-1 px-2 font-medium text-muted-foreground w-12">ID</th>
                                <th className="text-left py-1 px-2 font-medium text-muted-foreground w-10">Qtde</th>
                                <th className="text-left py-1 px-2 font-medium text-muted-foreground flex-1">Descrição</th>
                                <th className="text-left py-1 px-2 font-medium text-muted-foreground w-24">Dim. Visual</th>
                                <th className="text-left py-1 px-2 font-medium text-muted-foreground w-24">Dim. Arquivo</th>
                                <th className="text-left py-1 px-2 font-medium text-muted-foreground w-12">m²</th>
                                <th className="text-left py-1 px-2 font-medium text-muted-foreground w-32">Material/Acabamento</th>
                                <th className="text-right py-1 px-2 font-medium text-muted-foreground w-16">Ações</th>
                              </tr>
                            </>
                          ) : (
                            <>
                              <tr className="border-b border-border/30">
                                <th colSpan={8} className="text-left py-1 px-2 font-semibold">
                                  {group.type}
                                </th>
                              </tr>
                              <tr className="border-b border-border/40">
                                <th className="text-left py-1 px-2 font-medium text-muted-foreground w-12">ID</th>
                                <th className="text-left py-1 px-2 font-medium text-muted-foreground w-10">Qtde</th>
                                <th className="text-left py-1 px-2 font-medium text-muted-foreground flex-1">Descrição</th>
                                <th className="text-left py-1 px-2 font-medium text-muted-foreground w-24">Dim. Visual</th>
                                <th className="text-left py-1 px-2 font-medium text-muted-foreground w-24">Dim. Arquivo</th>
                                <th className="text-left py-1 px-2 font-medium text-muted-foreground w-12">m²</th>
                                <th className="text-left py-1 px-2 font-medium text-muted-foreground w-32">Material/Acabamento</th>
                                <th className="text-right py-1 px-2 font-medium text-muted-foreground w-16">Ações</th>
                              </tr>
                            </>
                          )}
                        </thead>
                        <tbody>
                          {group.items.map(item => (
                            <tr key={item.id} className="border-b border-border/40 hover-elevate" data-testid={`row-pending-item-${item.id}`}>
                              {activeTab === "criar-aprovacoes" && (
                                <td className="text-center py-1 px-2">
                                  <Checkbox
                                    checked={selectedItemIds.has(item.id)}
                                    onCheckedChange={() => toggleItemSelection(item.id)}
                                    data-testid={`checkbox-item-${item.id}`}
                                  />
                                </td>
                              )}
                              <td className="py-1 px-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-semibold text-primary" data-testid={`text-display-id-${item.id}`}>
                                    {item.displayId}
                                  </span>
                                  {activeTab === "finalizados" && <StatusBadge status={item.status} />}
                                  {activeTab === "criar-aprovacoes" && item.rejectedBySponsor && (
                                    <Badge 
                                      variant="outline" 
                                      className="text-xs border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400"
                                      data-testid={`badge-rejected-sponsor-${item.id}`}
                                    >
                                      {item.status === 'awaiting_sponsor_approval' ? 'Refazer Thumb' : 'Reprovado Patrocinador'}
                                    </Badge>
                                  )}
                                  {activeTab === "criar-aprovacoes" && item.rejectedByCreator && (
                                    <Badge 
                                      variant="outline" 
                                      className="text-xs border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-400"
                                      data-testid={`badge-rejected-creator-${item.id}`}
                                    >
                                      Reprovado Criador
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              <td className="py-1 px-2 tabular-nums w-10">{item.quantity}</td>
                              <td className="py-1 px-2 text-sm text-muted-foreground flex-1 break-words">{item.description || '—'}</td>
                              <td className="py-1 px-2 tabular-nums text-xs w-24">
                                {item.visualWidth && item.visualHeight ? `${item.visualWidth}×${item.visualHeight}` : '—'}
                              </td>
                              <td className="py-1 px-2 tabular-nums text-xs w-24">
                                {item.fileWidth && item.fileHeight ? `${item.fileWidth}×${item.fileHeight}` : '—'}
                              </td>
                              <td className="py-1 px-2 tabular-nums font-semibold w-12">{item.calculatedM2}</td>
                              <td className="py-1 px-2 text-xs w-32">{item.material} · {item.finish}</td>
                              <td className="py-1 px-2 text-right">
                                <Button
                                  size="icon"
                                  variant={activeTab === "criar-aprovacoes" || activeTab === "finalizar-layouts" ? "default" : "outline"}
                                  onClick={() => handleViewDetails(item)}
                                  data-testid={`button-view-${item.id}`}
                                  title={activeTab === "criar-aprovacoes" ? "Enviar p/ Aprovação" : activeTab === "finalizar-layouts" ? "Finalizar Layout" : "Ver Detalhes"}
                                >
                                  {activeTab === "criar-aprovacoes" ? <Send className="h-4 w-4" /> : 
                                   activeTab === "finalizar-layouts" ? <FileImage className="h-4 w-4" /> : 
                                   <Eye className="h-4 w-4" />}
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Fragment>
                ));
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      <ItemDetailsDialog
        item={selectedItem}
        auditLogs={selectedItem ? auditLogs.filter((log: any) => log.entityType === 'item' && log.entityId === selectedItem.id) : []}
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItem(null)}
        topActions={selectedItem?.status === 'sponsor_approved' ? (
          <Card className="border-2 border-green-200 dark:border-green-900">
            <CardHeader className="px-4 py-3 bg-green-50/50 dark:bg-green-950/20">
              <CardTitle className="text-sm font-semibold text-green-700 dark:text-green-400 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Finalização de Layout
              </CardTitle>
              <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                Patrocinador aprovou! Adicione o caminho do arquivo final.
              </p>
            </CardHeader>
            <CardContent className="px-4 py-4 space-y-4">
              {/* THUMB DE APROVAÇÃO - Primeiro e em destaque */}
              {selectedItem.approvalThumbUrl && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                    {selectedItem.approvalThumbUrl.toLowerCase().endsWith('.pdf') ? (
                      <>
                        <FileText className="h-3.5 w-3.5" />
                        Thumb Aprovado (PDF)
                      </>
                    ) : (
                      <>
                        <FileImage className="h-3.5 w-3.5" />
                        Thumb Aprovado
                      </>
                    )}
                  </Label>
                  <div className="flex justify-center rounded-lg bg-muted/50 p-3 border">
                    {selectedItem.approvalThumbUrl.toLowerCase().endsWith('.pdf') ? (
                      <a
                        href={selectedItem.approvalThumbUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded-lg hover-elevate text-red-700 dark:text-red-400 font-medium"
                      >
                        <FileText className="h-5 w-5" />
                        <div className="flex flex-col items-start">
                          <span>Abrir PDF</span>
                          <span className="text-xs text-red-600 dark:text-red-500">Clique para visualizar</span>
                        </div>
                      </a>
                    ) : (
                      <img
                        src={selectedItem.approvalThumbUrl}
                        alt="Thumb aprovado"
                        className="max-h-[150px] max-w-full object-contain rounded shadow-sm"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* CAMINHO DO ARQUIVO FINAL - Campo de texto */}
              <div className="space-y-2">
                <Label htmlFor="finalFilePath" className="text-xs font-medium flex items-center gap-2">
                  <FolderOpen className="h-3.5 w-3.5" />
                  Caminho do Arquivo Final
                </Label>
                <Input
                  id="finalFilePath"
                  placeholder="Ex: /servidor/artes/evento/arquivo-final.pdf"
                  value={finalFileUrl}
                  onChange={(e) => setFinalFileUrl(e.target.value)}
                  className="text-sm"
                  data-testid="input-final-file-path"
                />
                <p className="text-xs text-muted-foreground">
                  Informe o caminho onde o arquivo final está salvo no servidor
                </p>
              </div>

              {/* Botão de enviar */}
              <div className="flex justify-end">
                <Button
                  onClick={handleSubmitFinalFile}
                  disabled={submitFinalFileMutation.isPending || !finalFileUrl}
                  data-testid="button-submit-final"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Enviar para Revisão
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
        customActions={selectedItem && (
          <div className="space-y-4">
            {/* Upload de Thumb de Aprovação */}
            {(selectedItem.status === 'requested' || selectedItem.status === 'awaiting_submission') && (
              <Card className="border-purple-200 dark:border-purple-800">
                {/* Header com Botão de Enviar */}
                <CardHeader className="px-4 py-3 bg-purple-50/50 dark:bg-purple-950/20 border-b border-purple-100 dark:border-purple-900">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-purple-600 flex items-center justify-center">
                        <FileImage className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold text-purple-800 dark:text-purple-300">
                          Criar Thumb de Aprovação
                        </CardTitle>
                        <p className="text-xs text-purple-600 dark:text-purple-400">
                          {approvalThumbUrl ? "Thumb pronto - clique para enviar" : "Faça upload da imagem primeiro"}
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={handleSubmitForApproval}
                      disabled={submitForApprovalMutation.isPending || !approvalThumbUrl}
                      className={approvalThumbUrl ? "bg-purple-600 hover:bg-purple-700" : ""}
                      data-testid="button-submit-approval-header"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Enviar para Aprovação
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="px-4 py-3 space-y-3">
                  {/* Área de Preview e Upload */}
                  {approvalThumbPreview && approvalThumbPreview.trim() !== "" ? (
                    <div className="space-y-3">
                      {/* Preview da imagem */}
                      <div className="relative w-full min-h-48 max-h-80 rounded-lg border-2 border-dashed border-purple-200 dark:border-purple-700 bg-purple-50/30 dark:bg-purple-950/10 flex items-center justify-center p-4">
                        <img 
                          src={approvalThumbPreview} 
                          alt="Preview do Thumb" 
                          className="max-h-full max-w-full object-contain rounded shadow-sm"
                          onError={(e) => {
                            console.error('Erro ao carregar imagem:', approvalThumbPreview);
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        {/* Badge de sucesso */}
                        <div className="absolute top-2 right-2">
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800">
                            <Check className="h-3 w-3 mr-1" />
                            Pronto
                          </Badge>
                        </div>
                      </div>
                      <FileUploader
                        onGetUploadParameters={getUploadUrl}
                        onComplete={(result) => {
                          const localPath = convertGCSUrlToLocalPath(result.url);
                          setApprovalThumbUrl(localPath);
                          setApprovalThumbPreview(localPath);
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
                    <div className="space-y-3">
                      {/* Área de upload vazia com instruções */}
                      <div className="w-full min-h-48 rounded-lg border-2 border-dashed border-purple-200 dark:border-purple-700 bg-purple-50/30 dark:bg-purple-950/10 flex flex-col items-center justify-center p-6 text-center">
                        <div className="h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-3">
                          <FileImage className="h-6 w-6 text-purple-500" />
                        </div>
                        <p className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-1">
                          Nenhuma imagem selecionada
                        </p>
                        <p className="text-xs text-purple-500 dark:text-purple-400 mb-4">
                          Faça upload de uma imagem leve (preview) para o patrocinador aprovar
                        </p>
                        <FileUploader
                          onGetUploadParameters={getUploadUrl}
                          onComplete={(result) => {
                            const localPath = convertGCSUrlToLocalPath(result.url);
                            setApprovalThumbUrl(localPath);
                            setApprovalThumbPreview(localPath);
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
                              const preview = e.target?.result as string;
                              setApprovalThumbPreview(preview);
                            };
                            reader.readAsDataURL(file);
                          }}
                          accept="image/*"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Fazer Upload do Thumb
                        </FileUploader>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

          </div>
        )}
      />

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
                  <a
                    href={sharedPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded-lg hover-elevate text-red-700 dark:text-red-400 font-medium"
                  >
                    <FileText className="h-5 w-5" />
                    <div className="flex flex-col items-start">
                      <span>Abrir PDF Compartilhado</span>
                      <span className="text-xs text-red-600 dark:text-red-500">Clique para visualizar</span>
                    </div>
                  </a>
                  <FileUploader
                    onGetUploadParameters={getUploadUrl}
                    onComplete={(result) => {
                      const localPath = convertGCSUrlToLocalPath(result.url);
                      setSharedPdfUrl(localPath);
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
