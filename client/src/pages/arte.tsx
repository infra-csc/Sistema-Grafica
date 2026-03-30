import { useQuery, useMutation } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, Eye, Calendar, Truck, Filter, Check, ChevronsUpDown, Search, Upload, FileImage, File, Clock, Package, ClipboardList, Send, FolderOpen, FileText, RotateCcw, X } from "lucide-react";
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

  // Correção states
  const [correcaoItem, setCorrecaoItem] = useState<any>(null);
  const [correcaoThumbUrl, setCorrecaoThumbUrl] = useState<string>("");
  const [correcaoSelectedSponsorIds, setCorrecaoSelectedSponsorIds] = useState<Set<string>>(new Set());
  const [correcaoSponsorFilter, setCorrecaoSponsorFilter] = useState<string>("all");

  const { data: allItems = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const { data: correcaoItems = [], isLoading: correcaoLoading } = useQuery<any[]>({
    queryKey: ["/api/items/resubmission-needed"],
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
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
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

  const resubmitMutation = useMutation({
    mutationFn: async ({ itemId, newThumbUrl, sponsorIds }: { itemId: string; newThumbUrl: string; sponsorIds: string[] }) => {
      return await apiRequest("POST", `/api/items/${itemId}/sponsor-approvals/resubmit`, { newThumbUrl, sponsorIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/resubmission-needed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setCorrecaoItem(null);
      setCorrecaoThumbUrl("");
      setCorrecaoSelectedSponsorIds(new Set());
      toast({
        title: "Nova arte enviada",
        description: "O Atendimento foi notificado para revisar",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" });
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
      return `/objects/${filePath}`;
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
          // 'awaiting_submission' = rejected by creator (Solicitação) → Arte needs to redo + resubmit
          // 'requested' = new item, Arte needs to send for approval
          // Note: awaiting_arte sponsor rejections now appear in the Correção tab, NOT here
          matchesView = item.status === 'requested' || 
            item.status === 'awaiting_submission';
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
  const correcaoCount = correcaoItems.length;

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
        {[
          {
            label: "Pendentes",
            value: pendingCount,
            sub: "Aguardando liberação",
            icon: AlertCircle,
            accent: "#f97316",
            testId: "stat-pending",
          },
          {
            label: "Aguard. Patrocinador",
            value: itemsForEvent.filter(i => i.status === 'awaiting_sponsor_approval').length,
            sub: "Enviado p/ aprovação",
            icon: Clock,
            accent: "#d97706",
            testId: "stat-awaiting-sponsor",
          },
          {
            label: "Patrocinador Aprovou",
            value: itemsForEvent.filter(i => i.status === 'sponsor_approved').length,
            sub: "Aguard. solicitação",
            icon: CheckCircle,
            accent: "#2563eb",
            testId: "stat-sponsor-approved",
          },
          {
            label: "Prontos p/ Produção",
            value: itemsForEvent.filter(i => i.status === 'ready_for_production' || i.status === 'approved').length,
            sub: "Liberados",
            icon: Package,
            accent: "#16a34a",
            testId: "stat-ready-production",
          },
        ].map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.testId}
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e7e5e4',
                borderLeft: idx === 0 ? '3px solid #f97316' : '1px solid #e7e5e4',
                borderRadius: 12,
                padding: '16px 20px',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                cursor: 'default',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  {stat.label}
                </span>
                <Icon style={{ width: 16, height: 16, color: '#e7e5e4' }} />
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#1c1917', lineHeight: 1 }} data-testid={stat.testId}>
                {stat.value}
              </div>
              <p style={{ fontSize: 12, color: '#a8a29e', marginTop: 4 }}>{stat.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Abas Titanium — segmented control premium */}
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e7e5e4',
        borderRadius: 12,
        padding: 6,
        display: 'flex',
        gap: 4,
      }}>
        {[
          {
            id: "criar-aprovacoes", label: "Mandar para Aprovação", count: pendingCount,
            icon: Send, testId: "tab-criar-aprovacoes",
            activeBg: '#fafaf9', activeColor: '#1c1917', badgeBg: '#1c1917', badgeColor: '#ffffff',
          },
          {
            id: "correcao", label: "Correção", count: correcaoCount,
            icon: RotateCcw, testId: "tab-correcao",
            activeBg: '#fef2f2', activeColor: '#dc2626', badgeBg: '#dc2626', badgeColor: '#ffffff',
          },
          {
            id: "finalizar-layouts", label: "Finalizar Arte", count: needsFinalFileCount,
            icon: Upload, testId: "tab-finalizar-layouts",
            activeBg: '#f0fdf4', activeColor: '#15803d', badgeBg: '#15803d', badgeColor: '#ffffff',
          },
          {
            id: "finalizados", label: "Finalizados", count: finalizadosCount,
            icon: CheckCircle, testId: "tab-finalizados",
            activeBg: '#fafaf9', activeColor: '#78716c', badgeBg: '#e7e5e4', badgeColor: '#78716c',
          },
        ].map(tab => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={tab.testId}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                height: 40,
                padding: '0 16px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                backgroundColor: isActive ? tab.activeBg : 'transparent',
                color: isActive ? tab.activeColor : '#78716c',
                fontWeight: isActive ? 700 : 500,
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = '#fafaf9';
                  e.currentTarget.style.color = '#1c1917';
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#78716c';
                }
              }}
            >
              <Icon style={{ width: 14, height: 14 }} />
              <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{tab.label}</span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 20,
                height: 18,
                borderRadius: 100,
                fontSize: 11,
                fontWeight: 700,
                backgroundColor: isActive ? tab.badgeBg : '#f5f5f4',
                color: isActive ? tab.badgeColor : '#71717a',
                padding: '1px 7px',
              }}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

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
          {activeTab === "correcao" ? (
            /* ---- CORREÇÃO TAB ---- */
            correcaoLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : correcaoItems.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle style={{ width: 48, height: 48, color: '#16a34a', margin: '0 auto 16px' }} />
                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1c1917', marginBottom: 6 }}>Sem correção pendente</h3>
                <p style={{ fontSize: 13, color: '#a8a29e' }}>Nenhum item aguarda nova versão de arte</p>
              </div>
            ) : (() => {
              // Compute unique sponsors across all correcao items
              const correcaoSponsors: { id: string; name: string; color: string }[] = [];
              const seenSponsorIds = new Set<string>();
              correcaoItems.forEach((item: any) => {
                (item.awaitingArteApprovals || []).forEach((a: any) => {
                  if (a.sponsor && !seenSponsorIds.has(a.sponsorId)) {
                    seenSponsorIds.add(a.sponsorId);
                    correcaoSponsors.push({ id: a.sponsorId, name: a.sponsor.name, color: a.sponsor.color });
                  }
                });
              });

              // Apply sponsor filter
              const filteredCorrecaoItems = correcaoSponsorFilter === "all"
                ? correcaoItems
                : correcaoItems.filter((item: any) =>
                    (item.awaitingArteApprovals || []).some((a: any) => a.sponsorId === correcaoSponsorFilter)
                  );

              return (
                <div style={{ display: 'flex', flexDirection: 'column' }}>

                  {/* ── FILTRO POR PATROCINADOR ──────────────── */}
                  {correcaoSponsors.length > 1 && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      marginBottom: 14, flexWrap: 'wrap',
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>
                        Filtrar:
                      </span>
                      {[{ id: "all", name: "Todos", color: "#a8a29e" }, ...correcaoSponsors].map(sp => {
                        const isActive = correcaoSponsorFilter === sp.id;
                        return (
                          <button
                            key={sp.id}
                            onClick={() => setCorrecaoSponsorFilter(sp.id)}
                            data-testid={`filter-correcao-sponsor-${sp.id}`}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              height: 30, padding: '0 12px', borderRadius: 100,
                              border: isActive ? '1.5px solid #dc2626' : '1px solid #e7e5e4',
                              backgroundColor: isActive ? '#fef2f2' : '#ffffff',
                              color: isActive ? '#dc2626' : '#78716c',
                              fontSize: 12, fontWeight: isActive ? 700 : 500,
                              cursor: 'pointer', transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = '#1c1917'; e.currentTarget.style.color = '#1c1917'; } }}
                            onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = '#e7e5e4'; e.currentTarget.style.color = '#78716c'; } }}
                          >
                            {sp.id !== "all" && (
                              <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: sp.color, flexShrink: 0 }} />
                            )}
                            {sp.name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* ── CONTADOR ─────────────────────────────── */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', backgroundColor: '#dc2626',
                      flexShrink: 0, animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
                    }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#dc2626' }}>
                      {filteredCorrecaoItems.length} {filteredCorrecaoItems.length === 1 ? 'item aguardando' : 'itens aguardando'} correção
                      {correcaoSponsorFilter !== "all" && ` · ${correcaoSponsors.find(s => s.id === correcaoSponsorFilter)?.name}`}
                    </span>
                  </div>

                  {/* ── CARDS ────────────────────────────────── */}
                  {filteredCorrecaoItems.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0' }}>
                      <p style={{ fontSize: 13, color: '#a8a29e' }}>Nenhum item para o patrocinador selecionado</p>
                    </div>
                  ) : filteredCorrecaoItems.map((item: any) => {
                    const approvalsToShow = correcaoSponsorFilter === "all"
                      ? item.awaitingArteApprovals
                      : item.awaitingArteApprovals.filter((a: any) => a.sponsorId === correcaoSponsorFilter);
                    return (
                      <div
                        key={item.id}
                        data-testid={`card-correcao-${item.id}`}
                        style={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #e7e5e4',
                          borderLeft: '4px solid #dc2626',
                          borderRadius: 12,
                          overflow: 'hidden',
                          marginBottom: 12,
                        }}
                      >
                        {/* ── LINHA 1 — HEADER COMPACTO ─────────── */}
                        <div style={{
                          padding: '14px 16px 10px',
                          display: 'flex', alignItems: 'center',
                          gap: 8, flexWrap: 'wrap',
                        }}>
                          <span style={{
                            fontFamily: '"DM Mono", monospace', fontWeight: 700, fontSize: 12,
                            backgroundColor: '#1c1917', color: '#ffffff',
                            padding: '3px 8px', borderRadius: 6, flexShrink: 0,
                          }}>
                            {item.displayId}
                          </span>
                          <span style={{
                            backgroundColor: '#fafaf9', border: '1px solid #e7e5e4',
                            borderRadius: 6, padding: '3px 9px',
                            fontSize: 12, fontWeight: 600, color: '#1c1917', flexShrink: 0,
                          }}>
                            {item.type}
                          </span>
                          <span style={{ color: '#e7e5e4', flexShrink: 0 }}>·</span>
                          <span style={{ fontSize: 12, color: '#78716c', flexShrink: 0 }}>
                            Qtde: <strong style={{ color: '#1c1917' }}>{item.quantity ?? '—'}</strong>
                          </span>
                          {item.event && (
                            <>
                              <span style={{ color: '#e7e5e4', flexShrink: 0 }}>·</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#78716c', flexShrink: 0 }}>
                                <Calendar style={{ width: 11, height: 11 }} />
                                {item.event.name}
                              </span>
                              {item.event.truckDepartureDate && (
                                <>
                                  <span style={{ color: '#e7e5e4', flexShrink: 0 }}>·</span>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#78716c', flexShrink: 0 }}>
                                    <Truck style={{ width: 11, height: 11 }} />
                                    Saída: {new Date(item.event.truckDepartureDate).toLocaleDateString('pt-BR')}
                                  </span>
                                </>
                              )}
                            </>
                          )}
                          <span style={{
                            marginLeft: 'auto', flexShrink: 0,
                            backgroundColor: '#fef2f2', border: '1px solid #fecaca',
                            color: '#dc2626', borderRadius: 6,
                            fontSize: 10, fontWeight: 700, letterSpacing: '0.5px',
                            padding: '3px 10px',
                          }}>
                            CORREÇÃO
                          </span>
                        </div>

                        {/* ── LINHA 2 — REPROVAÇÕES ─────────────── */}
                        <div style={{
                          padding: '0 16px 12px',
                          borderTop: '1px solid #fef2f2', paddingTop: 10,
                        }}>
                          <p style={{ fontSize: 10, fontWeight: 600, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
                            Reprovado por
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {approvalsToShow.map((approval: any) => (
                              <div
                                key={approval.id}
                                style={{
                                  display: 'flex', alignItems: 'flex-start', gap: 12,
                                  backgroundColor: '#fef2f2', border: '1px solid #fecaca',
                                  borderRadius: 8, padding: '10px 12px',
                                }}
                              >
                                {/* Coluna esquerda */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                                    {approval.sponsor?.color && (
                                      <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: approval.sponsor.color, flexShrink: 0 }} />
                                    )}
                                    <span style={{ fontWeight: 700, fontSize: 13, color: '#1c1917' }}>
                                      {approval.sponsor?.name || 'Patrocinador'}
                                    </span>
                                    <span style={{ fontSize: 11, color: '#a8a29e' }}>
                                      por {approval.rejectedBy}
                                      {approval.rejectedAt && <> em {new Date(approval.rejectedAt).toLocaleDateString('pt-BR')}</>}
                                    </span>
                                  </div>
                                  {approval.rejectionReason && (
                                    <div style={{
                                      backgroundColor: '#ffffff', border: '1px solid #fecaca',
                                      borderRadius: 6, padding: '6px 10px', marginTop: 6,
                                      fontSize: 12,
                                    }}>
                                      <span style={{ fontWeight: 700, color: '#dc2626' }}>Motivo:</span>
                                      <span style={{ color: '#1c1917' }}> {approval.rejectionReason}</span>
                                    </div>
                                  )}
                                </div>
                                {/* Coluna direita — botão ver arquivo */}
                                {item.approvalThumbUrl && (
                                  <a
                                    href={item.approvalThumbUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      flexShrink: 0,
                                      display: 'inline-flex', alignItems: 'center', gap: 4,
                                      backgroundColor: '#ffffff', border: '1px solid #fecaca',
                                      color: '#dc2626', borderRadius: 6,
                                      fontSize: 11, fontWeight: 500,
                                      padding: '5px 10px', whiteSpace: 'nowrap',
                                      textDecoration: 'none', transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fef2f2')}
                                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#ffffff')}
                                  >
                                    <FileText style={{ width: 11, height: 11 }} />
                                    Ver arquivo
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* ── LINHA 3 — FOOTER ──────────────────── */}
                        <div style={{
                          padding: '10px 16px',
                          backgroundColor: '#fafaf9',
                          borderTop: '1px solid #e7e5e4',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#a8a29e' }}>
                            {item.approvalThumbUrl ? (
                              <><FileText style={{ width: 12, height: 12 }} /> Thumb reprovado anexado</>
                            ) : (
                              <span style={{ color: '#fca5a5' }}>Sem thumb anterior</span>
                            )}
                          </span>
                          <button
                            onClick={() => {
                              setCorrecaoItem(item);
                              setCorrecaoThumbUrl("");
                              setCorrecaoSelectedSponsorIds(new Set(item.awaitingArteApprovals.map((a: any) => a.sponsorId)));
                            }}
                            data-testid={`button-open-correcao-${item.id}`}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              backgroundColor: '#dc2626', color: '#ffffff', border: 'none',
                              borderRadius: 8, height: 36, padding: '0 16px',
                              fontWeight: 600, fontSize: 13, cursor: 'pointer',
                              transition: 'background 0.2s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#b91c1c')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#dc2626')}
                          >
                            <RotateCcw style={{ width: 13, height: 13 }} />
                            Enviar Nova Arte
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          ) : isLoading ? (
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
                            <Fragment key={item.id}>
                            <tr className="border-b border-border/40 hover-elevate" data-testid={`row-pending-item-${item.id}`}>
                              {activeTab === "criar-aprovacoes" && (
                                <td className="text-center py-1 px-2">
                                  <Checkbox
                                    checked={selectedItemIds.has(item.id)}
                                    onCheckedChange={() => toggleItemSelection(item.id)}
                                    data-testid={`checkbox-item-${item.id}`}
                                  />
                                </td>
                              )}
                              <td className="py-1 px-2 min-w-[120px]">
                                <div className="flex flex-col items-start gap-0.5">
                                  <span className="font-mono font-semibold text-primary whitespace-nowrap" data-testid={`text-display-id-${item.id}`}>
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
                            {item.observations && (
                              <tr className="bg-amber-50/50 dark:bg-amber-950/20 border-b border-amber-200/30 dark:border-amber-900/30">
                                <td colSpan={8} className="py-2 px-3">
                                  <div className="flex gap-2 items-start">
                                    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                                    <div className="text-sm text-amber-800 dark:text-amber-200">
                                      <span className="font-semibold">Observações da Ação:</span> {item.observations}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                            </Fragment>
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

      {/* ---- CORREÇÃO DIALOG ---- */}
      <Dialog open={!!correcaoItem} onOpenChange={(open) => {
        if (!open) {
          setCorrecaoItem(null);
          setCorrecaoThumbUrl("");
          setCorrecaoSelectedSponsorIds(new Set());
        }
      }}>
        <DialogContent className="p-0 gap-0 max-h-[90vh] overflow-y-auto" style={{ maxWidth: 560, borderRadius: 16, backgroundColor: '#ffffff' }}>
          <DialogTitle className="sr-only">Enviar Nova Arte</DialogTitle>
          <DialogDescription className="sr-only">Reenvio de arte para patrocinadores</DialogDescription>

          {/* ── HEADER ─────────────────────────────── */}
          <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #e7e5e4', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <RotateCcw style={{ width: 18, height: 18, color: '#dc2626', flexShrink: 0 }} />
              <span style={{ fontSize: 17, fontWeight: 700, color: '#1c1917' }}>Enviar Nova Arte</span>
            </div>
            {correcaoItem && (
              <p style={{ fontSize: 12, color: '#78716c', marginTop: 2 }}>
                {correcaoItem.displayId} — {correcaoItem.type}
                {correcaoItem.event?.name ? ` · ${correcaoItem.event.name}` : ''}
              </p>
            )}
            <button
              onClick={() => { setCorrecaoItem(null); setCorrecaoThumbUrl(""); setCorrecaoSelectedSponsorIds(new Set()); }}
              style={{
                position: 'absolute', top: 16, right: 16,
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#a8a29e', padding: 4, borderRadius: 6, lineHeight: 1,
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#1c1917')}
              onMouseLeave={e => (e.currentTarget.style.color = '#a8a29e')}
              data-testid="button-close-correcao-dialog"
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>

          {correcaoItem && (
            <>
              {/* ── REPROVAÇÕES ────────────────────────── */}
              <div style={{ padding: '16px 24px', backgroundColor: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
                <p style={{ fontSize: 10, fontWeight: 600, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>
                  Reprovações
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {correcaoItem.awaitingArteApprovals.map((approval: any) => (
                    <div key={approval.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
                      {approval.sponsor?.color && (
                        <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: approval.sponsor.color, flexShrink: 0, marginTop: 3 }} />
                      )}
                      <div>
                        <span style={{ fontWeight: 600, color: '#1c1917' }}>{approval.sponsor?.name || 'Patrocinador'}</span>
                        {approval.rejectionReason && (
                          <span style={{ color: '#78716c', fontStyle: 'italic' }}> — "{approval.rejectionReason}"</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── UPLOAD ─────────────────────────────── */}
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #e7e5e4' }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#1c1917', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 10 }}>
                  Nova Arte (Upload)
                </p>
                {correcaoThumbUrl ? (
                  <div style={{
                    border: '2px dashed #86efac', borderRadius: 10,
                    backgroundColor: '#f0fdf4', padding: 24,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                  }}>
                    {/\.(png|jpg|jpeg|gif|webp)/i.test(correcaoThumbUrl) ? (
                      <img src={correcaoThumbUrl} alt="Nova arte" style={{ maxHeight: 120, maxWidth: '100%', objectFit: 'contain', borderRadius: 6 }} />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#166534' }}>
                        <FileText style={{ width: 20, height: 20 }} />
                        <span style={{ fontSize: 13, fontWeight: 500 }}>Arquivo enviado com sucesso</span>
                      </div>
                    )}
                    <button
                      onClick={() => setCorrecaoThumbUrl("")}
                      data-testid="button-remove-correcao-thumb"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: 'none', border: '1px solid #86efac', borderRadius: 6,
                        color: '#166534', fontSize: 12, padding: '4px 10px', cursor: 'pointer',
                      }}
                    >
                      <X style={{ width: 12, height: 12 }} /> Remover
                    </button>
                  </div>
                ) : (
                  <div
                    style={{
                      border: '2px dashed #e7e5e4', borderRadius: 10,
                      backgroundColor: '#fafaf9', padding: 24,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                      transition: 'border-color 0.15s, background-color 0.15s',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = '#f97316';
                      (e.currentTarget as HTMLElement).style.backgroundColor = '#fff7ed';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = '#e7e5e4';
                      (e.currentTarget as HTMLElement).style.backgroundColor = '#fafaf9';
                    }}
                  >
                    <Upload style={{ width: 24, height: 24, color: '#a8a29e' }} />
                    <p style={{ fontSize: 13, color: '#78716c', margin: 0 }}>Arraste o arquivo ou clique para selecionar</p>
                    <p style={{ fontSize: 11, color: '#a8a29e', margin: 0 }}>PDF, JPG, PNG — máx. 50MB</p>
                    <FileUploader
                      onGetUploadParameters={getUploadUrl}
                      onComplete={(result) => {
                        const localPath = convertGCSUrlToLocalPath(result.url);
                        setCorrecaoThumbUrl(localPath);
                      }}
                      accept="image/*,application/pdf"
                      data-testid="uploader-correcao-thumb"
                    >
                      <Upload style={{ width: 14, height: 14, marginRight: 6 }} />
                      Fazer Upload da Nova Arte
                    </FileUploader>
                  </div>
                )}
              </div>

              {/* ── PATROCINADORES ─────────────────────── */}
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #e7e5e4' }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#1c1917', marginBottom: 10 }}>
                  Enviar para quais patrocinadores?
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {correcaoItem.awaitingArteApprovals.map((approval: any) => (
                    <label
                      key={approval.sponsorId}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                        userSelect: 'none', transition: 'background 0.15s, border-color 0.15s',
                        backgroundColor: correcaoSelectedSponsorIds.has(approval.sponsorId) ? '#f0fdf4' : '#fafaf9',
                        border: `1px solid ${correcaoSelectedSponsorIds.has(approval.sponsorId) ? '#86efac' : '#e7e5e4'}`,
                      }}
                    >
                      <Checkbox
                        checked={correcaoSelectedSponsorIds.has(approval.sponsorId)}
                        onCheckedChange={(checked) => {
                          const next = new Set(correcaoSelectedSponsorIds);
                          if (checked) next.add(approval.sponsorId);
                          else next.delete(approval.sponsorId);
                          setCorrecaoSelectedSponsorIds(next);
                        }}
                        data-testid={`checkbox-correcao-sponsor-${approval.sponsorId}`}
                        style={{ accentColor: '#1c1917' }}
                      />
                      {approval.sponsor?.color && (
                        <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: approval.sponsor.color, flexShrink: 0 }} />
                      )}
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1c1917', flex: 1 }}>
                        {approval.sponsor?.name || 'Patrocinador'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* ── FOOTER ──────────────────────────────── */}
              <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  onClick={() => { setCorrecaoItem(null); setCorrecaoThumbUrl(""); setCorrecaoSelectedSponsorIds(new Set()); }}
                  style={{
                    backgroundColor: '#fafaf9', border: '1px solid #e7e5e4',
                    color: '#78716c', borderRadius: 8, height: 40, padding: '0 20px',
                    fontSize: 13, cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#1c1917'; e.currentTarget.style.color = '#ffffff'; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fafaf9'; e.currentTarget.style.color = '#78716c'; }}
                >
                  Cancelar
                </button>
                <button
                  disabled={!correcaoThumbUrl || correcaoSelectedSponsorIds.size === 0 || resubmitMutation.isPending}
                  onClick={() => {
                    if (correcaoItem) {
                      resubmitMutation.mutate({
                        itemId: correcaoItem.id,
                        newThumbUrl: correcaoThumbUrl,
                        sponsorIds: Array.from(correcaoSelectedSponsorIds),
                      });
                    }
                  }}
                  data-testid="button-submit-correcao"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    backgroundColor: (!correcaoThumbUrl || correcaoSelectedSponsorIds.size === 0 || resubmitMutation.isPending) ? '#fca5a5' : '#dc2626',
                    color: '#ffffff', border: 'none', borderRadius: 8,
                    height: 40, padding: '0 20px', fontWeight: 700, fontSize: 14,
                    cursor: (!correcaoThumbUrl || correcaoSelectedSponsorIds.size === 0 || resubmitMutation.isPending) ? 'not-allowed' : 'pointer',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={e => {
                    if (!correcaoThumbUrl || correcaoSelectedSponsorIds.size === 0 || resubmitMutation.isPending) return;
                    e.currentTarget.style.backgroundColor = '#b91c1c';
                  }}
                  onMouseLeave={e => {
                    if (!correcaoThumbUrl || correcaoSelectedSponsorIds.size === 0 || resubmitMutation.isPending) return;
                    e.currentTarget.style.backgroundColor = '#dc2626';
                  }}
                >
                  {resubmitMutation.isPending ? (
                    <>
                      <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #fff', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <RotateCcw style={{ width: 14, height: 14 }} />
                      Enviar Nova Arte
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

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
                  {(() => {
                    const url = selectedItem.approvalThumbUrl.toLowerCase();
                    const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(url);
                    const isPdf = url.includes('.pdf') || (!isImage && url.includes('/objects/'));
                    
                    return (
                      <>
                        <Label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                          {isPdf ? (
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
                          {isPdf ? (
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
                      </>
                    );
                  })()}
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
                <CardHeader className="px-4 py-3 bg-purple-50/50 dark:bg-purple-950/20 border-b border-purple-100 dark:border-purple-900">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-purple-600 flex items-center justify-center">
                      <FileImage className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold text-purple-800 dark:text-purple-300">
                        Thumb de Aprovação
                      </CardTitle>
                      <p className="text-xs text-purple-600 dark:text-purple-400">
                        {approvalThumbUrl ? "Thumb carregado — confirme o envio abaixo" : "Faça upload da imagem de aprovação"}
                      </p>
                    </div>
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
                        <div className="absolute top-2 right-2">
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800">
                            <Check className="h-3 w-3 mr-1" />
                            Carregado
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileUploader
                          onGetUploadParameters={getUploadUrl}
                          onComplete={(result) => {
                            const localPath = convertGCSUrlToLocalPath(result.url);
                            setApprovalThumbUrl(localPath);
                            setApprovalThumbPreview(localPath);
                            toast({
                              title: "Upload concluído",
                              description: "Thumb atualizado — clique em Enviar para Aprovação para confirmar",
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
                      {/* Botão de envio — aparece somente após o upload */}
                      <div className="pt-1 border-t border-purple-100 dark:border-purple-900">
                        <Button
                          onClick={handleSubmitForApproval}
                          disabled={submitForApprovalMutation.isPending}
                          className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                          data-testid="button-submit-approval-header"
                        >
                          <Send className="h-4 w-4 mr-2" />
                          {submitForApprovalMutation.isPending ? "Enviando..." : "Enviar para Aprovação"}
                        </Button>
                      </div>
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
