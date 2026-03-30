import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, Eye, Calendar, Truck, Search, X, Package, MapPin, Ruler, FileText, Tag, XCircle, Users, Clock, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useState, useMemo, Fragment, useEffect, useRef } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SponsorApproval {
  id: string;
  itemId: string;
  sponsorId: string;
  status: 'pending' | 'approved' | 'rejected' | 'awaiting_arte' | 'new_version_pending';
  approvedBy?: string | null;
  approvedAt?: Date | null;
  rejectedBy?: string | null;
  rejectedAt?: Date | null;
  rejectionReason?: string | null;
  sponsor?: {
    id: string;
    name: string;
  } | null;
}

const statusMap = {
  requested: { label: "Solicitado", color: "bg-blue-500" },
  awaiting_sponsor_approval: { label: "Aguardando Aprovação Patrocinador", color: "bg-yellow-500" },
  sponsor_approved: { label: "Aprovado pelo Patrocinador", color: "bg-purple-500" },
  awaiting_creator_review: { label: "Aguardando Revisão Criador", color: "bg-orange-500" },
  ready_for_production: { label: "Liberado para Produção", color: "bg-cyan-500" },
  approved: { label: "Aprovado", color: "bg-green-500" },
  inProduction: { label: "Em Produção", color: "bg-indigo-500" },
  produced: { label: "Produzido", color: "bg-teal-500" },
  delivered: { label: "Entregue", color: "bg-emerald-600" },
} as const;

export default function Atendimento() {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [itemTypeFilter, setItemTypeFilter] = useState<string>("all");
  const [sponsorFilter, setSponsorFilter] = useState<string>("all");
  
  // Seleção múltipla
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  
  // Map para rastrear patrocinadores de cada item
  const [itemSponsorsMap, setItemSponsorsMap] = useState<Record<string, any[]>>({});
  const [loadingSponsors, setLoadingSponsors] = useState(false);
  
  // Map para rastrear aprovações de cada item (para mostrar na tabela)
  const [itemApprovalsMap, setItemApprovalsMap] = useState<Record<string, SponsorApproval[]>>({});
  
  // Request ID para evitar race conditions
  const requestIdRef = useRef(0);
  
  // State para aprovações individuais de patrocinadores (no diálogo)
  const [sponsorApprovals, setSponsorApprovals] = useState<SponsorApproval[]>([]);
  const [loadingSponsorApprovals, setLoadingSponsorApprovals] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectingSponsorId, setRejectingSponsorId] = useState<string | null>(null);

  const { data: items = [], isLoading: itemsLoading } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const { data: sponsors = [] } = useQuery<any[]>({
    queryKey: ["/api/sponsors"],
  });

  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs"],
  });

  // Memoizar awaiting items para evitar fetches desnecessários
  const awaitingItems = useMemo(() => 
    items.filter(item => 
      item.status === 'awaiting_sponsor_approval' && !item.skipApproval
    ), [items]
  );

  // Carregar patrocinadores e aprovações de items pendentes
  useEffect(() => {
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;
    
    if (awaitingItems.length === 0) {
      setItemSponsorsMap({});
      setItemApprovalsMap({});
      setLoadingSponsors(false);
      return;
    }
    
    setLoadingSponsors(true);
    
    // Carregar patrocinadores e aprovações em paralelo para cada item
    Promise.all(
      awaitingItems.map(async (item) => {
        try {
          const [sponsorsRes, approvalsRes] = await Promise.all([
            apiRequest("GET", `/api/items/${item.id}/sponsors`),
            apiRequest("GET", `/api/items/${item.id}/sponsor-approvals`)
          ]);
          const itemSponsors = await sponsorsRes.json();
          const itemApprovals = await approvalsRes.json();
          return { itemId: item.id, sponsors: itemSponsors, approvals: itemApprovals };
        } catch (error) {
          console.error(`Erro ao carregar dados do item ${item.id}:`, error);
          return { itemId: item.id, sponsors: [], approvals: [] };
        }
      })
    ).then(results => {
      if (currentRequestId === requestIdRef.current) {
        const sponsorsMap = results.reduce((acc, { itemId, sponsors }) => ({
          ...acc,
          [itemId]: sponsors
        }), {});
        
        const approvalsMap = results.reduce((acc, { itemId, approvals }) => ({
          ...acc,
          [itemId]: approvals
        }), {});
        
        setItemSponsorsMap(sponsorsMap);
        setItemApprovalsMap(approvalsMap);
        setLoadingSponsors(false);
      }
    });
  }, [awaitingItems]);

  // Carregar aprovações individuais de patrocinadores quando o dialog é aberto
  useEffect(() => {
    if (dialogOpen && selectedItem) {
      setLoadingSponsorApprovals(true);
      setSponsorApprovals([]);
      setRejectionReason("");
      setRejectingSponsorId(null);
      
      apiRequest("GET", `/api/items/${selectedItem.id}/sponsor-approvals`)
        .then(response => response.json())
        .then((approvals: SponsorApproval[]) => {
          console.log('Sponsor approvals loaded:', approvals);
          setSponsorApprovals(approvals);
          setLoadingSponsorApprovals(false);
        })
        .catch(error => {
          console.error('Error loading sponsor approvals:', error);
          setLoadingSponsorApprovals(false);
        });
    }
  }, [dialogOpen, selectedItem]);

  // Mutation para aprovar individualmente por patrocinador
  const individualApproveMutation = useMutation({
    mutationFn: async ({ itemId, sponsorId }: { itemId: string; sponsorId: string }) => {
      const response = await apiRequest("POST", `/api/items/${itemId}/sponsor-approvals/${sponsorId}/approve`, {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      
      if (data.allApproved) {
        setDialogOpen(false);
        setSelectedItem(null);
        toast({
          title: "Todos patrocinadores aprovaram",
          description: "O item avançou para finalização do arquivo",
        });
      } else {
        // Refetch approvals to get updated server state
        if (selectedItem) {
          apiRequest("GET", `/api/items/${selectedItem.id}/sponsor-approvals`)
            .then(response => response.json())
            .then((approvals: SponsorApproval[]) => {
              setSponsorApprovals(approvals);
            })
            .catch(console.error);
        }
        toast({
          title: "Patrocinador aprovou",
          description: `${data.approval?.sponsor?.name || 'Patrocinador'} aprovou o item`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao aprovar",
        description: error.message || "Ocorreu um erro ao aprovar",
        variant: "destructive",
      });
    },
  });

  // Mutation para reprovar individualmente por patrocinador
  const individualRejectMutation = useMutation({
    mutationFn: async ({ itemId, sponsorId, reason }: { itemId: string; sponsorId: string; reason?: string }) => {
      const response = await apiRequest("POST", `/api/items/${itemId}/sponsor-approvals/${sponsorId}/reject`, {
        rejectionReason: reason || null
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setRejectionReason("");
      setRejectingSponsorId(null);
      
      // Always refresh approvals to show updated state (including rejection reason)
      if (selectedItem) {
        apiRequest("GET", `/api/items/${selectedItem.id}/sponsor-approvals`)
          .then(response => response.json())
          .then((approvals: SponsorApproval[]) => {
            setSponsorApprovals(approvals);
          })
          .catch(console.error);
      }

      if (data.allDecided) {
        // All sponsors decided — keep dialog open so user can see rejection reasons
        toast({
          title: "Todos patrocinadores decidiram",
          description: "Item retornou para Arte refazer o thumb. Confira os motivos no diálogo.",
        });
      } else {
        toast({
          title: "Reprovação registrada",
          description: `Aguardando ${data.pendingCount} patrocinador(es). Arte foi notificada para preparar novo thumb.`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao reprovar",
        description: error.message || "Ocorreu um erro ao reprovar",
        variant: "destructive",
      });
    },
  });

  const sponsorApproveMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/sponsor-approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setDialogOpen(false);
      setSelectedItem(null);
      toast({
        title: "Item aprovado",
        description: "O item foi aprovado pelo patrocinador com sucesso!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao aprovar item",
        description: error.message || "Ocorreu um erro ao aprovar o item",
        variant: "destructive",
      });
    },
  });

  const sponsorRejectMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/sponsor-reject`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setDialogOpen(false);
      setSelectedItem(null);
      toast({
        title: "Item reprovado",
        description: "O item foi reprovado e retornou para a Arte refazer.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao reprovar item",
        description: error.message || "Ocorreu um erro ao reprovar o item",
        variant: "destructive",
      });
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      const approvePromises = itemIds.map(id => 
        apiRequest("PATCH", `/api/items/${id}/sponsor-approve`, {})
      );
      return await Promise.all(approvePromises);
    },
    onSuccess: (_, itemIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItemIds(new Set());
      toast({
        title: "Itens aprovados",
        description: `${itemIds.length} ${itemIds.length === 1 ? 'item foi aprovado' : 'itens foram aprovados'} com sucesso!`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao aprovar itens",
        description: error.message || "Ocorreu um erro ao aprovar os itens",
        variant: "destructive",
      });
    },
  });

  const bulkRejectMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      const rejectPromises = itemIds.map(id => 
        apiRequest("PATCH", `/api/items/${id}/sponsor-reject`, {})
      );
      return await Promise.all(rejectPromises);
    },
    onSuccess: (_, itemIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItemIds(new Set());
      toast({
        title: "Itens reprovados",
        description: `${itemIds.length} ${itemIds.length === 1 ? 'item foi reprovado' : 'itens foram reprovados'} e ${itemIds.length === 1 ? 'retornou' : 'retornaram'} para a Arte.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao reprovar itens",
        description: error.message || "Ocorreu um erro ao reprovar os itens",
        variant: "destructive",
      });
    },
  });

  // Filtrar itens aguardando aprovação de patrocinador
  const pendingItems = awaitingItems;
  
  // Filtros aplicados
  const filteredItems = useMemo(() => {
    return pendingItems.filter(item => {
      // IMPORTANTE: Filtrar itens "órfãos" que não têm patrocinadores
      // Esses items não deveriam estar aqui, mas podem existir se os patrocinadores foram deletados
      const hasSponsors = itemSponsorsMap[item.id]?.length > 0;
      if (!hasSponsors && !loadingSponsors) {
        return false; // Ignora items sem patrocinadores
      }
      
      // Filtro de busca por descrição/tipo
      const matchesSearch = searchTerm === "" || 
        item.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.name?.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Filtro de evento
      const matchesEvent = eventFilter === "all" || item.eventId === eventFilter;
      
      // Filtro de tipo de item
      const matchesType = itemTypeFilter === "all" || item.type === itemTypeFilter;
      
      // Filtro de patrocinador
      const matchesSponsor = sponsorFilter === "all" || 
        itemSponsorsMap[item.id]?.some(sponsor => sponsor.id === sponsorFilter);
      
      return matchesSearch && matchesEvent && matchesType && matchesSponsor;
    });
  }, [pendingItems, searchTerm, eventFilter, itemTypeFilter, sponsorFilter, itemSponsorsMap, loadingSponsors]);
  
  // Opções únicas para filtros
  const uniqueItemTypes = useMemo(() => {
    const types = new Set(pendingItems.map(item => item.type).filter(Boolean));
    return Array.from(types).sort();
  }, [pendingItems]);

  const getEventInfo = (eventId: string) => {
    return events.find(e => e.id === eventId);
  };

  const getSponsorInfo = (sponsorId: string) => {
    return sponsors.find(s => s.id === sponsorId);
  };

  const handleViewDetails = (item: any) => {
    setSelectedItem(item);
    setDialogOpen(true);
  };

  const handleApprove = () => {
    if (selectedItem) {
      sponsorApproveMutation.mutate(selectedItem.id);
    }
  };

  const handleReject = () => {
    if (selectedItem) {
      sponsorRejectMutation.mutate(selectedItem.id);
    }
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const toggleAllSelection = () => {
    if (selectedItemIds.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(filteredItems.map(item => item.id)));
    }
  };

  const handleBulkApprove = () => {
    const itemIds = Array.from(selectedItemIds);
    if (itemIds.length > 0) {
      bulkApproveMutation.mutate(itemIds);
    }
  };

  const handleBulkReject = () => {
    const itemIds = Array.from(selectedItemIds);
    if (itemIds.length > 0) {
      bulkRejectMutation.mutate(itemIds);
    }
  };

  if (itemsLoading || eventsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Carregando itens...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-6 gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Aprovação do Patrocinador</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Revise e aprove os thumbs de aprovação enviados pela equipe de Arte
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-lg px-4 py-2">
                <AlertCircle className="h-4 w-4 mr-2" />
                {pendingItems.length} Pendentes
              </Badge>
            </div>
          </div>
          
          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por descrição ou tipo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                  onClick={() => setSearchTerm("")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="w-full sm:w-[250px]" data-testid="select-event-filter">
                <SelectValue placeholder="Filtrar por evento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os eventos</SelectItem>
                {[...events].sort((a, b) => a.name.localeCompare(b.name)).map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={itemTypeFilter} onValueChange={setItemTypeFilter}>
              <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-type-filter">
                <SelectValue placeholder="Filtrar por tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {uniqueItemTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={sponsorFilter} onValueChange={setSponsorFilter}>
              <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-sponsor-filter">
                <SelectValue placeholder="Filtrar por patrocinador" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os patrocinadores</SelectItem>
                {[...sponsors].sort((a, b) => a.name.localeCompare(b.name)).map((sponsor) => (
                  <SelectItem key={sponsor.id} value={sponsor.id}>
                    {sponsor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {(searchTerm || eventFilter !== "all" || itemTypeFilter !== "all" || sponsorFilter !== "all") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchTerm("");
                  setEventFilter("all");
                  setItemTypeFilter("all");
                  setSponsorFilter("all");
                }}
                data-testid="button-clear-filters"
              >
                Limpar
              </Button>
            )}
            
            {selectedItemIds.size > 0 && (
              <>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleBulkApprove}
                  disabled={bulkApproveMutation.isPending}
                  data-testid="button-bulk-approve"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Aprovar {selectedItemIds.size} {selectedItemIds.size === 1 ? 'Item' : 'Itens'}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkReject}
                  disabled={bulkRejectMutation.isPending}
                  data-testid="button-bulk-reject"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reprovar {selectedItemIds.size} {selectedItemIds.size === 1 ? 'Item' : 'Itens'}
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        
        <CardContent>
          {itemsLoading || eventsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="h-12 w-12 text-status-completed mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {pendingItems.length === 0 ? "Nenhum item pendente" : "Nenhum resultado encontrado"}
              </h3>
              <p className="text-muted-foreground">
                {pendingItems.length === 0 
                  ? "Não há itens aguardando aprovação do patrocinador no momento."
                  : "Tente ajustar os filtros para ver mais resultados."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-center py-3 px-4 font-medium w-10">
                      <Checkbox
                        checked={selectedItemIds.size === filteredItems.length && filteredItems.length > 0}
                        onCheckedChange={toggleAllSelection}
                        data-testid="checkbox-select-all"
                      />
                    </th>
                    <th className="text-left py-3 px-4 font-medium">ID</th>
                    <th className="text-left py-3 px-4 font-medium">Tipo</th>
                    <th className="text-left py-3 px-4 font-medium">Descrição</th>
                    <th className="text-center py-3 px-4 font-medium">Qtd</th>
                    <th className="text-left py-3 px-4 font-medium">Patrocinador</th>
                    <th className="text-right py-3 px-4 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, index) => {
                    const event = getEventInfo(item.eventId);
                    const itemSponsors = itemSponsorsMap[item.id] || [];
                    const prevItem = index > 0 ? filteredItems[index - 1] : null;
                    const showEventHeader = !prevItem || prevItem.eventId !== item.eventId;
                    
                    return (
                      <Fragment key={item.id}>
                        {showEventHeader && (
                          <tr className="bg-gradient-to-r from-primary/10 to-primary/5 border-t-4 border-primary/30">
                            <td colSpan={7} className="py-2 px-4">
                              <div className="flex items-center gap-3">
                                <div className="h-5 w-1 bg-primary rounded-full"></div>
                                <div className="text-sm font-bold text-primary uppercase tracking-wider">
                                  {event?.name || 'Sem Evento'}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr
                          className="border-b border-border hover-elevate"
                          data-testid={`row-item-${item.id}`}
                        >
                          <td className="py-2 px-4 text-center">
                            <Checkbox
                              checked={selectedItemIds.has(item.id)}
                              onCheckedChange={() => toggleItemSelection(item.id)}
                              data-testid={`checkbox-item-${item.id}`}
                            />
                          </td>
                          <td className="py-2 px-4">
                            <div className="text-sm font-mono font-medium text-primary" data-testid={`text-display-id-${item.id}`}>
                              {item.displayId}
                            </div>
                            {/* Priority override: "Em Ajuste (Arte)" */}
                            {(itemApprovalsMap[item.id] || []).some((a: SponsorApproval) => a.status === 'awaiting_arte') && (
                              <span
                                data-testid={`badge-em-ajuste-${item.id}`}
                                style={{
                                  display: 'inline-block',
                                  marginTop: 3,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  letterSpacing: '0.3px',
                                  color: '#c2410c',
                                  backgroundColor: '#fff7ed',
                                  border: '1px solid #fed7aa',
                                  borderRadius: 4,
                                  padding: '1px 5px',
                                }}
                              >
                                Em Ajuste (Arte)
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-4">
                            <div className="text-sm font-medium">{item.type}</div>
                          </td>
                          <td className="py-2 px-4">
                            {item.description ? (
                              <div className="text-sm text-foreground">{item.description}</div>
                            ) : (
                              <div className="text-sm text-muted-foreground">—</div>
                            )}
                          </td>
                          <td className="py-2 px-4 text-center">
                            <Badge variant="outline">{item.quantity}</Badge>
                          </td>
                          <td className="py-2 px-4">
                            {loadingSponsors ? (
                              <div className="text-xs text-muted-foreground">Carregando...</div>
                            ) : itemSponsors.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {itemSponsors.map((sponsor) => {
                                  const approvals = itemApprovalsMap[item.id] || [];
                                  const approval = approvals.find((a: SponsorApproval) => a.sponsorId === sponsor.id);
                                  const status = approval?.status || 'pending';
                                  
                                  const getStatusStyle = () => {
                                    if (status === 'approved') {
                                      return {
                                        backgroundColor: '#dcfce7',
                                        borderColor: '#16a34a',
                                        color: '#15803d'
                                      };
                                    } else if (status === 'rejected') {
                                      return {
                                        backgroundColor: '#fee2e2',
                                        borderColor: '#dc2626',
                                        color: '#b91c1c'
                                      };
                                    } else if (status === 'awaiting_arte') {
                                      return {
                                        backgroundColor: '#fff7ed',
                                        borderColor: '#ea580c',
                                        color: '#c2410c'
                                      };
                                    } else if (status === 'new_version_pending') {
                                      return {
                                        backgroundColor: '#eff6ff',
                                        borderColor: '#3b82f6',
                                        color: '#1d4ed8'
                                      };
                                    } else {
                                      return {
                                        backgroundColor: '#fef9c3',
                                        borderColor: '#ca8a04',
                                        color: '#a16207'
                                      };
                                    }
                                  };
                                  
                                  return (
                                    <Badge 
                                      key={sponsor.id} 
                                      variant="outline" 
                                      className="text-xs py-1 px-2 font-medium"
                                      style={getStatusStyle()}
                                    >
                                      {status === 'approved' ? (
                                        <CheckCircle className="w-3.5 h-3.5 mr-1" />
                                      ) : status === 'rejected' ? (
                                        <XCircle className="w-3.5 h-3.5 mr-1" />
                                      ) : status === 'awaiting_arte' ? (
                                        <AlertCircle className="w-3.5 h-3.5 mr-1" />
                                      ) : status === 'new_version_pending' ? (
                                        <Eye className="w-3.5 h-3.5 mr-1" />
                                      ) : (
                                        <Clock className="w-3.5 h-3.5 mr-1" />
                                      )}
                                      {sponsor.name}
                                    </Badge>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground">—</div>
                            )}
                          </td>
                          <td className="py-2 px-4 text-right">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleViewDetails(item)}
                              data-testid={`button-view-${item.id}`}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Revisar
                            </Button>
                          </td>
                        </tr>
                        {item.observations && (
                          <tr className="bg-amber-50/50 dark:bg-amber-950/20 border-b border-amber-200/30 dark:border-amber-900/30">
                            <td colSpan={7} className="py-2 px-4">
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Aprovação do Patrocinador</DialogTitle>
            <DialogDescription>
              Revise os detalhes e o thumb de aprovação antes de aprovar
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4">
              {/* Banner de reenvio após reprovação */}
              {selectedItem.rejectedBySponsor && selectedItem.status === 'awaiting_sponsor_approval' && (
                <div style={{
                  backgroundColor: '#fff7ed',
                  border: '1px solid #fed7aa',
                  borderRadius: 8,
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                }}>
                  <AlertCircle style={{ width: 16, height: 16, color: '#ea580c', flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#c2410c', margin: '0 0 2px' }}>
                      Reenvio após reprovação
                    </p>
                    <p style={{ fontSize: 12, color: '#9a3412', margin: 0 }}>
                      A Arte enviou um novo thumb após reprovação anterior. Revise o thumb abaixo e aprove/reprove cada patrocinador novamente.
                    </p>
                  </div>
                </div>
              )}

              {selectedItem.approvalThumbUrl && (
                <Card className="border-2 border-primary/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2 text-primary">
                      <Eye className="w-5 h-5" />
                      Thumb de Aprovação
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-center rounded-lg bg-muted/50 p-3 h-[200px]">
                      {(() => {
                        const url = selectedItem.approvalThumbUrl.toLowerCase();
                        const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(url);
                        const isPdf = url.includes('.pdf') || (!isImage && url.includes('/objects/'));
                        
                        return isPdf ? (
                          <a
                            href={selectedItem.approvalThumbUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-300 dark:border-blue-800 rounded-lg hover-elevate text-blue-700 dark:text-blue-400 font-medium"
                          >
                            <FileText className="h-5 w-5" />
                            <div className="flex flex-col items-start">
                              <span>Abrir PDF de Aprovação</span>
                              <span className="text-xs text-blue-600 dark:text-blue-500">Clique para visualizar</span>
                            </div>
                          </a>
                        ) : (
                          <img
                            src={selectedItem.approvalThumbUrl}
                            alt="Thumb de aprovação"
                            className="max-h-full max-w-full object-contain shadow-lg"
                          />
                        );
                      })()}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Package className="w-4 h-4 text-primary" />
                      Informações do Item
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-start gap-2">
                      <Tag className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="font-medium">{selectedItem.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{selectedItem.type}</div>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center py-1.5 border-t">
                      <span className="text-muted-foreground">Quantidade</span>
                      <Badge variant="secondary">{selectedItem.quantity}</Badge>
                    </div>
                    
                    {(selectedItem.material || selectedItem.finish) && (
                      <div className="space-y-1.5 pt-1.5 border-t">
                        {selectedItem.material && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Material</span>
                            <span className="font-medium">{selectedItem.material}</span>
                          </div>
                        )}
                        {selectedItem.finish && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Acabamento</span>
                            <span className="font-medium">{selectedItem.finish}</span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {itemSponsorsMap[selectedItem.id]?.length > 0 && (
                      <div className="pt-1.5 border-t">
                        <div className="flex items-center gap-2 mb-2">
                          <Users className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium">
                            Aprovação por Patrocinador
                          </span>
                        </div>
                        
                        {loadingSponsorApprovals ? (
                          <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Carregando status...
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {itemSponsorsMap[selectedItem.id].map((sponsor) => {
                              const approval = sponsorApprovals.find(a => a.sponsorId === sponsor.id);
                              const status = approval?.status || 'pending';
                              const isRejectingThis = rejectingSponsorId === sponsor.id;
                              
                              return (
                                <div 
                                  key={sponsor.id} 
                                  className="border rounded-lg p-3"
                                  style={{
                                    borderColor: sponsor.color || '#3b82f6',
                                    backgroundColor: `${sponsor.color || '#3b82f6'}08`
                                  }}
                                  data-testid={`sponsor-approval-${sponsor.id}`}
                                >
                                  <div className="flex items-center gap-2 mb-2">
                                    <span 
                                      className="w-3 h-3 rounded-full shrink-0"
                                      style={{ backgroundColor: sponsor.color || '#3b82f6' }}
                                    />
                                    <span 
                                      className="font-semibold text-sm"
                                      style={{ color: sponsor.color || '#3b82f6' }}
                                    >
                                      {sponsor.name}
                                    </span>
                                  </div>
                                  
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {status === 'approved' && (
                                        <Badge variant="default" className="bg-green-500 text-xs">
                                          <CheckCircle className="w-3 h-3 mr-1" />
                                          Aprovado
                                        </Badge>
                                      )}
                                      {(status === 'rejected') && (
                                        <Badge variant="destructive" className="text-xs">
                                          <XCircle className="w-3 h-3 mr-1" />
                                          Reprovado
                                        </Badge>
                                      )}
                                      {status === 'awaiting_arte' && (
                                        <Badge className="text-xs" style={{ backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>
                                          <AlertCircle className="w-3 h-3 mr-1" />
                                          Aguardando Arte
                                        </Badge>
                                      )}
                                      {status === 'new_version_pending' && (
                                        <Badge className="text-xs" style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                                          <Eye className="w-3 h-3 mr-1" />
                                          Nova Arte Recebida
                                        </Badge>
                                      )}
                                      {status === 'pending' && (
                                        <Badge variant="secondary" className="text-xs">
                                          <Clock className="w-3 h-3 mr-1" />
                                          Pendente
                                        </Badge>
                                      )}
                                    </div>
                                    
                                    {(status === 'pending' || status === 'new_version_pending') && !isRejectingThis && (
                                      <div className="flex items-center gap-1">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                          onClick={() => setRejectingSponsorId(sponsor.id)}
                                          disabled={individualRejectMutation.isPending}
                                          data-testid={`button-reject-sponsor-${sponsor.id}`}
                                        >
                                          <XCircle className="w-3 h-3 mr-1" />
                                          Reprovar
                                        </Button>
                                        <Button
                                          size="sm"
                                          className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700"
                                          onClick={() => individualApproveMutation.mutate({
                                            itemId: selectedItem.id,
                                            sponsorId: sponsor.id
                                          })}
                                          disabled={individualApproveMutation.isPending}
                                          data-testid={`button-approve-sponsor-${sponsor.id}`}
                                        >
                                          {individualApproveMutation.isPending ? (
                                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                          ) : (
                                            <CheckCircle className="w-3 h-3 mr-1" />
                                          )}
                                          Aprovar
                                        </Button>
                                      </div>
                                    )}
                                    {status === 'awaiting_arte' && (
                                      <span style={{ fontSize: 11, color: '#a8a29e' }}>Botões bloqueados até Arte reenviar</span>
                                    )}
                                  </div>
                                  
                                  {isRejectingThis && (
                                    <div style={{ marginTop: 12, borderTop: '1px solid #e7e5e4', paddingTop: 14 }}>
                                      {/* Title */}
                                      <p style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', margin: '0 0 10px' }}>
                                        Reprovar Arte e Solicitar Ajuste
                                      </p>
                                      {/* Warning bar */}
                                      <div style={{
                                        backgroundColor: '#fafaf9',
                                        borderLeft: '4px solid #ea580c',
                                        borderRadius: 4,
                                        padding: '8px 12px',
                                        marginBottom: 10,
                                      }}>
                                        <p style={{ fontSize: 12, color: '#9a3412', margin: 0, lineHeight: 1.5 }}>
                                          O item será devolvido para a equipe de Arte. Por favor, detalhe o que precisa ser corrigido.
                                        </p>
                                      </div>
                                      {/* Thumbnail of what is being rejected */}
                                      {selectedItem?.approvalThumbUrl && (() => {
                                        const url = selectedItem.approvalThumbUrl.toLowerCase();
                                        const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(url);
                                        const isPdf = url.includes('.pdf') || (!isImage && url.includes('/objects/'));
                                        return (
                                          <div style={{ marginBottom: 10 }}>
                                            <p style={{ fontSize: 11, fontWeight: 600, color: '#78716c', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                              Arte sendo reprovada:
                                            </p>
                                            <div style={{ backgroundColor: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 6, padding: 8, display: 'flex', justifyContent: 'center' }}>
                                              {isPdf ? (
                                                <a href={selectedItem.approvalThumbUrl} target="_blank" rel="noopener noreferrer"
                                                  style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#c2410c', fontSize: 12, fontWeight: 500 }}>
                                                  <FileText style={{ width: 16, height: 16 }} />
                                                  Abrir PDF
                                                </a>
                                              ) : (
                                                <img src={selectedItem.approvalThumbUrl} alt="Thumb atual" style={{ maxHeight: 90, maxWidth: '100%', objectFit: 'contain', borderRadius: 4 }} />
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })()}
                                      {/* Textarea */}
                                      <Textarea
                                        placeholder="Ex: O logo do patrocinador está esticado..."
                                        value={rejectionReason}
                                        onChange={(e) => setRejectionReason(e.target.value)}
                                        className="text-sm h-16 resize-none"
                                        style={{
                                          backgroundColor: '#fafaf9',
                                          borderColor: rejectionReason.trim() === '' ? '#fca5a5' : '#e7e5e4',
                                        }}
                                        data-testid={`textarea-rejection-reason-${sponsor.id}`}
                                      />
                                      {rejectionReason.trim() === '' && (
                                        <p className="text-xs text-red-500 mt-1">Informe o motivo antes de confirmar.</p>
                                      )}
                                      <div className="flex gap-2 justify-end mt-3">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => {
                                            setRejectingSponsorId(null);
                                            setRejectionReason("");
                                          }}
                                        >
                                          Cancelar
                                        </Button>
                                        <Button
                                          size="sm"
                                          style={{ backgroundColor: '#1c1917', color: '#ffffff' }}
                                          onClick={() => individualRejectMutation.mutate({
                                            itemId: selectedItem.id,
                                            sponsorId: sponsor.id,
                                            reason: rejectionReason
                                          })}
                                          disabled={individualRejectMutation.isPending || rejectionReason.trim() === ''}
                                          data-testid={`button-confirm-reject-${sponsor.id}`}
                                        >
                                          {individualRejectMutation.isPending ? (
                                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                          ) : (
                                            <XCircle className="w-3 h-3 mr-1" />
                                          )}
                                          Confirmar Reprovação
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                  
                                  {approval?.approvedBy && status === 'approved' && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                      Aprovado por {approval.approvedBy}
                                      {approval.approvedAt && (
                                        <> em {format(new Date(approval.approvedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</>
                                      )}
                                    </div>
                                  )}
                                  
                                  {approval?.rejectedBy && (status === 'rejected' || status === 'awaiting_arte' || status === 'new_version_pending') && (
                                    <div className="text-xs mt-1" style={{ color: '#c2410c' }}>
                                      Reprovado por {approval.rejectedBy}
                                      {approval.rejectedAt && (
                                        <> em {format(new Date(approval.rejectedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</>
                                      )}
                                      {approval.rejectionReason && (
                                        <div className="mt-1 rounded px-2 py-1" style={{ backgroundColor: '#fff7ed', color: '#9a3412', border: '1px solid #fed7aa' }}>
                                          <strong>Motivo:</strong> {approval.rejectionReason}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {((selectedItem.visualWidth && selectedItem.visualHeight) || 
                      (selectedItem.fileWidth && selectedItem.fileHeight)) && (
                      <div className="space-y-2 pt-1.5 border-t">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Ruler className="w-3.5 h-3.5" />
                          <span className="text-xs font-medium">Dimensões</span>
                        </div>
                        {selectedItem.visualWidth && selectedItem.visualHeight && (
                          <div className="flex justify-between text-xs pl-5">
                            <span className="text-muted-foreground">Área Visual</span>
                            <span className="font-medium">
                              {selectedItem.visualWidth}m × {selectedItem.visualHeight}m
                            </span>
                          </div>
                        )}
                        {selectedItem.fileWidth && selectedItem.fileHeight && (
                          <div className="flex justify-between text-xs pl-5">
                            <span className="text-muted-foreground">Arquivo</span>
                            <span className="font-medium">
                              {selectedItem.fileWidth}m × {selectedItem.fileHeight}m
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary" />
                      Informações do Evento
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {(() => {
                      const event = getEventInfo(selectedItem.eventId);
                      return event ? (
                        <>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Nome do Evento</div>
                            <div className="font-medium">{event.name}</div>
                          </div>
                          
                          <div className="flex items-start gap-2 pt-1.5 border-t">
                            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <div className="text-xs text-muted-foreground mb-0.5">Local</div>
                              <div className="font-medium">{event.location}</div>
                            </div>
                          </div>
                          
                          <div className="flex items-start gap-2 pt-1.5 border-t">
                            <Calendar className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <div className="text-xs text-muted-foreground mb-0.5">Data do Evento</div>
                              <div className="font-medium">
                                {format(new Date(event.startDate), "dd/MM/yyyy", { locale: ptBR })}
                              </div>
                            </div>
                          </div>
                          
                          {event.truckDepartureDate && (
                            <div className="flex items-start gap-2 pt-1.5 border-t">
                              <Truck className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <div className="text-xs text-muted-foreground mb-0.5">Saída do Caminhão</div>
                                <div className="font-medium text-orange-500">
                                  {format(new Date(event.truckDepartureDate), "dd/MM/yyyy HH:mm", {
                                    locale: ptBR,
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-muted-foreground">Evento não encontrado</div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>

              {selectedItem.notes && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary" />
                      Observações
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {selectedItem.notes}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* ---- TIMELINE ---- */}
              {(() => {
                const itemLogs = (auditLogs as any[])
                  .filter(log => log.entityType === 'item' && log.entityId === selectedItem.id)
                  .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                if (itemLogs.length === 0) return null;

                const getDotColor = (action: string) => {
                  if (!action) return '#a8a29e';
                  const a = action.toLowerCase();
                  if (a.includes('reject') || a.includes('reprova') || a.includes('devolu')) return '#ea580c';
                  if (a.includes('approv') || a.includes('aprova') || a.includes('libera')) return '#16a34a';
                  if (a.includes('resubmit') || a.includes('reenvio') || a.includes('nova')) return '#3b82f6';
                  return '#a8a29e';
                };

                return (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="w-4 h-4 text-primary" />
                        Histórico do Item
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div style={{ position: 'relative', paddingLeft: 24 }}>
                        {/* Vertical line */}
                        <div style={{
                          position: 'absolute', left: 7, top: 6, bottom: 6,
                          width: 2, backgroundColor: '#e7e5e4'
                        }} />
                        {itemLogs.map((log: any) => {
                          const dotColor = getDotColor(log.action || '');
                          return (
                            <div key={log.id} style={{ position: 'relative', marginBottom: 16, paddingBottom: 2 }}>
                              {/* Dot */}
                              <div style={{
                                position: 'absolute', left: -21, top: 4,
                                width: 10, height: 10, borderRadius: '50%',
                                backgroundColor: dotColor,
                                border: '2px solid #ffffff',
                                boxShadow: '0 0 0 1px #e7e5e4',
                              }} />
                              {/* Time and actor */}
                              <div style={{ fontSize: 11, color: '#a8a29e', marginBottom: 2 }}>
                                {log.createdAt && format(new Date(log.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                {log.userName && <> · <span style={{ color: '#78716c', fontWeight: 600 }}>{log.userName}</span></>}
                              </div>
                              {/* Description */}
                              <div style={{ fontSize: 13, color: '#1c1917', fontWeight: 500 }}>
                                {log.details || log.action || 'Ação registrada'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              data-testid="button-cancel"
            >
              Fechar
            </Button>
            {/* Mostrar botões gerais apenas se não tiver patrocinadores vinculados */}
            {selectedItem && (!itemSponsorsMap[selectedItem.id] || itemSponsorsMap[selectedItem.id].length === 0) && (
              <>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={sponsorRejectMutation.isPending}
                  data-testid="button-reject"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  {sponsorRejectMutation.isPending ? "Reprovando..." : "Reprovar"}
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={sponsorApproveMutation.isPending}
                  data-testid="button-approve"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {sponsorApproveMutation.isPending ? "Aprovando..." : "Aprovar"}
                </Button>
              </>
            )}
            {/* Mostrar dica para itens com patrocinadores */}
            {selectedItem && itemSponsorsMap[selectedItem.id]?.length > 0 && (
              <p className="text-xs text-muted-foreground text-right">
                Use os botões individuais acima para aprovar/reprovar cada patrocinador
              </p>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
