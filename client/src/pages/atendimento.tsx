import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, Eye, Calendar, Truck, Search, X, Package, MapPin, Ruler, FileText, Tag, XCircle, Users, Clock, Loader2, RotateCcw } from "lucide-react";
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

  // Contador real: só itens que precisam de ação IMEDIATA (sem awaiting_arte bloqueando)
  const actionableCount = useMemo(() => {
    if (loadingSponsors) return null; // ainda carregando
    return pendingItems.filter(item => {
      const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
      const hasArteBlock = approvals.some(a => a.status === 'awaiting_arte');
      if (hasArteBlock) return false; // Arte precisa reenviar primeiro
      return approvals.some(a => a.status === 'rejected' || a.status === 'pending' || a.status === 'new_version_pending');
    }).length;
  }, [pendingItems, itemApprovalsMap, loadingSponsors]);

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
              {actionableCount !== null && (
                <span
                  data-testid="badge-pendentes-count"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    backgroundColor: actionableCount === 0 ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${actionableCount === 0 ? '#86efac' : '#fecaca'}`,
                    color: actionableCount === 0 ? '#15803d' : '#dc2626',
                    borderRadius: 100,
                    fontSize: 12, fontWeight: 700,
                    padding: '3px 12px',
                  }}
                >
                  {actionableCount === 0 ? (
                    <CheckCircle style={{ width: 13, height: 13 }} />
                  ) : (
                    <AlertCircle style={{ width: 13, height: 13 }} />
                  )}
                  {actionableCount === 1
                    ? '1 Pendente'
                    : `${actionableCount} Pendentes`}
                </span>
              )}
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
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  marginTop: 4,
                                  fontSize: 10, fontWeight: 600,
                                  color: '#c2410c',
                                  backgroundColor: '#fff7ed',
                                  border: '1px solid #fed7aa',
                                  borderRadius: 6,
                                  padding: '2px 8px',
                                }}
                              >
                                <RotateCcw style={{ width: 9, height: 9 }} />
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
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                {itemSponsors.map((sponsor) => {
                                  const approvals = itemApprovalsMap[item.id] || [];
                                  const approval = approvals.find((a: SponsorApproval) => a.sponsorId === sponsor.id);
                                  const status = approval?.status || 'pending';

                                  // 2 visual states: APROVADO (green) | AGUARDANDO (amber)
                                  // rejected + awaiting_arte are both "waiting for Arte" — same amber badge
                                  const isAprovado = status === 'approved';

                                  const badgeStyle = isAprovado ? {
                                    backgroundColor: '#f0fdf4',
                                    border: '1px solid #86efac',
                                    color: '#15803d',
                                  } : {
                                    backgroundColor: '#fff7ed',
                                    border: '1px solid #fed7aa',
                                    color: '#c2410c',
                                  };

                                  const dotColor = isAprovado ? '#15803d' : '#f97316';

                                  return (
                                    <span
                                      key={sponsor.id}
                                      data-testid={`badge-sponsor-${sponsor.id}-item-${item.id}`}
                                      style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        borderRadius: 100, padding: '3px 10px',
                                        fontSize: 11, fontWeight: 600,
                                        ...badgeStyle,
                                      }}
                                    >
                                      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0 }} />
                                      {isAprovado ? (
                                        <CheckCircle style={{ width: 11, height: 11 }} />
                                      ) : (
                                        <Clock style={{ width: 11, height: 11 }} />
                                      )}
                                      {sponsor.name}
                                    </span>
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
        <DialogContent className="max-w-[680px] max-h-[92vh] overflow-y-auto p-0 gap-0 rounded-2xl">
          <DialogTitle className="sr-only">Aprovação do Patrocinador</DialogTitle>
          <DialogDescription className="sr-only">Revise os detalhes e o thumb antes de aprovar</DialogDescription>

          {selectedItem && (() => {
            const ev = events.find((e: any) => e.id === selectedItem.eventId);
            const thumbUrl = selectedItem.approvalThumbUrl;
            const isPdf = thumbUrl && (thumbUrl.toLowerCase().includes('.pdf') || thumbUrl.toLowerCase().includes('/objects/')) && !/\.(png|jpg|jpeg|gif|webp)$/i.test(thumbUrl.toLowerCase());
            const hasRejections = sponsorApprovals.some(a => a.status === 'awaiting_arte' || a.status === 'rejected' || a.status === 'new_version_pending');
            const itemLogs = (auditLogs as any[])
              .filter(log => log.entityType === 'item' && log.entityId === selectedItem.id)
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            const sponsors = itemSponsorsMap[selectedItem.id] || [];

            return (
            <div style={{ fontFamily: "'DM Sans', sans-serif" }}>

              {/* ── BLOCO 1: Header ── */}
              <div style={{ padding: '20px 24px 16px', position: 'relative', borderBottom: '1px solid #e7e5e4' }}>
                <div style={{ paddingRight: 32 }}>
                  <p style={{ fontSize: 18, fontWeight: 700, color: '#1c1917', margin: 0 }}>Aprovação do Patrocinador</p>
                  <p style={{ fontSize: 13, color: '#78716c', margin: '2px 0 0' }}>Revise os detalhes e o thumb antes de aprovar</p>
                </div>
                <button
                  onClick={() => setDialogOpen(false)}
                  data-testid="button-close-dialog"
                  style={{
                    position: 'absolute', top: 18, right: 18,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#a8a29e', padding: 4, borderRadius: 6,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#1c1917')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#a8a29e')}
                >
                  <X style={{ width: 18, height: 18 }} />
                </button>
              </div>

              {/* ── BLOCO 2: Detalhes do item ── */}
              <div style={{ padding: '16px 24px', backgroundColor: '#fafaf9', borderBottom: '1px solid #e7e5e4' }}>
                {/* Row 1: 4 colunas */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 14 }}>
                  {/* ID */}
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#a8a29e', margin: '0 0 4px' }}>ID</p>
                    <span style={{
                      fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 13,
                      backgroundColor: '#1c1917', color: '#ffffff',
                      padding: '3px 8px', borderRadius: 6, display: 'inline-block',
                    }}>{selectedItem.displayId}</span>
                  </div>
                  {/* Tipo */}
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#a8a29e', margin: '0 0 4px' }}>Tipo</p>
                    <span style={{
                      fontSize: 13, fontWeight: 600, color: '#1c1917',
                      backgroundColor: '#ffffff', border: '1px solid #e7e5e4',
                      borderRadius: 6, padding: '3px 9px', display: 'inline-block',
                    }}>{selectedItem.type}</span>
                  </div>
                  {/* Qtde */}
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#a8a29e', margin: '0 0 4px' }}>Qtde</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#1c1917', margin: 0 }}>{selectedItem.quantity ?? '—'}</p>
                  </div>
                  {/* Patrocinador(es) */}
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#a8a29e', margin: '0 0 4px' }}>Patrocinador</p>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#1c1917', margin: 0, lineHeight: 1.4 }}>
                      {sponsors.length > 0 ? sponsors.map((s: any) => s.name).join(', ') : '—'}
                    </p>
                  </div>
                </div>
                {/* Row 2: 3 colunas */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, paddingTop: 14, borderTop: '1px solid #e7e5e4' }}>
                  {/* Visual */}
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#a8a29e', margin: '0 0 4px' }}>Visual</p>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: '#78716c', fontWeight: 600, margin: 0 }}>
                      {(selectedItem.visualWidth && selectedItem.visualHeight)
                        ? `${selectedItem.visualWidth}×${selectedItem.visualHeight}m`
                        : '—'}
                    </p>
                  </div>
                  {/* Evento */}
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#a8a29e', margin: '0 0 4px' }}>Evento</p>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#1c1917', margin: 0, lineHeight: 1.4 }}>{ev?.name ?? '—'}</p>
                  </div>
                  {/* Prazo */}
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#a8a29e', margin: '0 0 4px' }}>Prazo (Saída)</p>
                    {ev?.truckDepartureDate ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="animate-pulse" style={{
                          width: 8, height: 8, borderRadius: '50%',
                          backgroundColor: '#f97316', flexShrink: 0,
                          display: 'inline-block',
                        }} />
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#f97316', margin: 0, fontFamily: "'DM Mono', monospace" }}>
                          {format(new Date(ev.truckDepartureDate), "dd/MM HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    ) : (
                      <p style={{ fontSize: 13, color: '#a8a29e', margin: 0 }}>—</p>
                    )}
                  </div>
                </div>

                {/* Primary CTA: View art */}
                {thumbUrl && (
                  <a
                    href={thumbUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="button-view-art-primary"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      marginTop: 12, width: '100%', height: 42,
                      backgroundColor: '#1c1917', color: '#ffffff',
                      borderRadius: 10, fontSize: 14, fontWeight: 600,
                      textDecoration: 'none', transition: 'background-color 0.2s',
                      boxSizing: 'border-box',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f97316')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#1c1917')}
                  >
                    {isPdf ? <FileText style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                    {isPdf ? 'Abrir PDF para Revisão' : 'Abrir Arte para Revisão'}
                  </a>
                )}
              </div>

              {/* ── BLOCO 3: Alerta de reenvio (condicional) ── */}
              {selectedItem.rejectedBySponsor && selectedItem.status === 'awaiting_sponsor_approval' && (
                <div style={{
                  padding: '12px 24px',
                  backgroundColor: '#fff7ed',
                  borderLeft: '3px solid #f97316',
                  borderBottom: '1px solid #e7e5e4',
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                  <AlertCircle style={{ width: 16, height: 16, color: '#f97316', flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#c2410c', margin: 0 }}>Reenvio após reprovação</p>
                    <p style={{ fontSize: 12, color: '#78716c', margin: '2px 0 0' }}>A Arte enviou um novo thumb. Revise e aprove/reprove abaixo.</p>
                  </div>
                </div>
              )}

              {/* ── BLOCO 4: Feedback dos patrocinadores ── */}
              {sponsors.length > 0 && (
                <div style={{ padding: '16px 24px', borderBottom: '1px solid #e7e5e4' }}>
                  <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#a8a29e', margin: '0 0 10px' }}>
                    Feedback dos Patrocinadores
                  </p>

                  {loadingSponsorApprovals ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a8a29e', fontSize: 13, padding: '8px 0' }}>
                      <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
                      Carregando status...
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {sponsors.map((sponsor: any) => {
                        const approval = sponsorApprovals.find(a => a.sponsorId === sponsor.id);
                        const status = approval?.status || 'pending';
                        const isRejectingThis = rejectingSponsorId === sponsor.id;

                        const dotColor =
                          status === 'approved' ? '#16a34a'
                          : status === 'new_version_pending' ? '#3b82f6'
                          : '#f97316'; // rejected, awaiting_arte, pending → all orange dot

                        return (
                          <div
                            key={sponsor.id}
                            data-testid={`sponsor-approval-${sponsor.id}`}
                            style={{
                              backgroundColor: '#ffffff', border: '1px solid #e7e5e4',
                              borderRadius: 12, padding: 16,
                            }}
                          >
                            {/* Top row: dot + name + badge + blocked text */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0, display: 'inline-block' }} />
                              <span style={{ fontSize: 15, fontWeight: 700, color: sponsor.color || '#1c1917', flex: 1 }}>{sponsor.name}</span>
                              {/* Status badge */}
                              {status === 'approved' && (
                                <span style={{ fontSize: 11, fontWeight: 600, backgroundColor: '#f0fdf4', border: '1px solid #86efac', color: '#15803d', borderRadius: 100, padding: '3px 10px' }}>
                                  Aprovado
                                </span>
                              )}
                              {(status === 'rejected' || status === 'awaiting_arte') && (
                                <span style={{ fontSize: 11, fontWeight: 600, backgroundColor: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c', borderRadius: 100, padding: '3px 10px' }}>
                                  Aguardando Arte
                                </span>
                              )}
                              {status === 'new_version_pending' && (
                                <span style={{ fontSize: 11, fontWeight: 600, backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 100, padding: '3px 10px' }}>
                                  Nova Arte Recebida
                                </span>
                              )}
                              {status === 'pending' && (
                                <span style={{ fontSize: 11, fontWeight: 600, backgroundColor: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c', borderRadius: 100, padding: '3px 10px' }}>
                                  Aguardando
                                </span>
                              )}
                              {(status === 'rejected' || status === 'awaiting_arte') && (
                                <span style={{ fontSize: 11, color: '#a8a29e', marginLeft: 'auto' }}>Botões bloqueados até Arte reenviar</span>
                              )}
                            </div>

                            {/* Rejection meta */}
                            {approval?.rejectedBy && (status === 'rejected' || status === 'awaiting_arte' || status === 'new_version_pending') && (
                              <p style={{ fontSize: 12, color: '#dc2626', margin: '8px 0 0' }}>
                                Reprovado por {approval.rejectedBy}
                                {approval.rejectedAt && <> em {format(new Date(approval.rejectedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</>}
                              </p>
                            )}

                            {/* Rejection reason box */}
                            {approval?.rejectionReason && (status === 'rejected' || status === 'awaiting_arte' || status === 'new_version_pending') && !isRejectingThis && (
                              <div style={{ marginTop: 8, backgroundColor: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 8, padding: '10px 14px' }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#1c1917' }}>Motivo: </span>
                                <span style={{ fontSize: 13, color: '#78716c' }}>{approval.rejectionReason}</span>
                              </div>
                            )}

                            {/* Approval meta */}
                            {approval?.approvedBy && status === 'approved' && (
                              <p style={{ fontSize: 12, color: '#16a34a', margin: '8px 0 0' }}>
                                Aprovado por {approval.approvedBy}
                                {approval.approvedAt && <> em {format(new Date(approval.approvedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</>}
                              </p>
                            )}

                            {/* Rejection form */}
                            {isRejectingThis && (
                              <div style={{ marginTop: 14, borderTop: '1px solid #e7e5e4', paddingTop: 14 }}>
                                <p style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', margin: '0 0 8px' }}>Reprovar Arte e Solicitar Ajuste</p>
                                <div style={{ backgroundColor: '#fafaf9', borderLeft: '3px solid #ea580c', borderRadius: 4, padding: '8px 12px', marginBottom: 10 }}>
                                  <p style={{ fontSize: 12, color: '#9a3412', margin: 0, lineHeight: 1.5 }}>
                                    O item será devolvido para Arte. Detalhe o que precisa ser corrigido.
                                  </p>
                                </div>
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
                                  <p style={{ fontSize: 12, color: '#dc2626', margin: '4px 0 0' }}>Informe o motivo antes de confirmar.</p>
                                )}
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                                  <button
                                    onClick={() => { setRejectingSponsorId(null); setRejectionReason(""); }}
                                    style={{
                                      backgroundColor: '#fafaf9', border: '1px solid #e7e5e4', color: '#78716c',
                                      borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 500,
                                      cursor: 'pointer', transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f5f5f4'; }}
                                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fafaf9'; }}
                                  >Cancelar</button>
                                  <button
                                    onClick={() => individualRejectMutation.mutate({ itemId: selectedItem.id, sponsorId: sponsor.id, reason: rejectionReason })}
                                    disabled={individualRejectMutation.isPending || rejectionReason.trim() === ''}
                                    data-testid={`button-confirm-reject-${sponsor.id}`}
                                    style={{
                                      backgroundColor: '#1c1917', color: '#ffffff',
                                      border: 'none', borderRadius: 8, padding: '7px 16px',
                                      fontSize: 13, fontWeight: 600, cursor: rejectionReason.trim() === '' ? 'not-allowed' : 'pointer',
                                      opacity: rejectionReason.trim() === '' ? 0.5 : 1, transition: 'all 0.15s',
                                    }}
                                  >
                                    {individualRejectMutation.isPending ? 'Reprovando...' : 'Confirmar Reprovação'}
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Approve/Reject buttons */}
                            {(status === 'pending' || status === 'new_version_pending') && !isRejectingThis && (
                              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                                <button
                                  onClick={() => setRejectingSponsorId(sponsor.id)}
                                  disabled={individualRejectMutation.isPending}
                                  data-testid={`button-reject-sponsor-${sponsor.id}`}
                                  style={{
                                    flex: 1, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
                                    borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#dc2626'; e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.borderColor = '#dc2626'; }}
                                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fef2f2'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fecaca'; }}
                                >
                                  <XCircle style={{ width: 15, height: 15 }} />
                                  Reprovar
                                </button>
                                <button
                                  onClick={() => individualApproveMutation.mutate({ itemId: selectedItem.id, sponsorId: sponsor.id })}
                                  disabled={individualApproveMutation.isPending}
                                  data-testid={`button-approve-sponsor-${sponsor.id}`}
                                  style={{
                                    flex: 1, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    backgroundColor: '#f0fdf4', border: '1px solid #86efac', color: '#15803d',
                                    borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#15803d'; e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.borderColor = '#15803d'; }}
                                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f0fdf4'; e.currentTarget.style.color = '#15803d'; e.currentTarget.style.borderColor = '#86efac'; }}
                                >
                                  {individualApproveMutation.isPending ? (
                                    <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
                                  ) : (
                                    <CheckCircle style={{ width: 15, height: 15 }} />
                                  )}
                                  Aprovar
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── BLOCO 5: Histórico do item ── */}
              {itemLogs.length > 0 && (
                <div style={{ padding: '16px 24px', backgroundColor: '#fafaf9', borderBottom: '1px solid #e7e5e4' }}>
                  <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#a8a29e', margin: '0 0 12px' }}>
                    Histórico do Item
                  </p>
                  <div style={{ position: 'relative', paddingLeft: 22 }}>
                    <div style={{ position: 'absolute', left: 3, top: 8, bottom: 8, width: 1, backgroundColor: '#e7e5e4' }} />
                    {itemLogs.map((log: any, idx: number) => {
                      const isRecent = idx === 0;
                      const dotColor = (() => {
                        const a = (log.action || '').toLowerCase();
                        if (a.includes('reject') || a.includes('reprova')) return '#ea580c';
                        if (a.includes('approv') || a.includes('aprova') || a.includes('libera')) return '#16a34a';
                        if (a.includes('resubmit') || a.includes('reenvio')) return '#3b82f6';
                        return isRecent ? '#f97316' : '#d4d0ca';
                      })();
                      return (
                        <div key={log.id} style={{ position: 'relative', marginBottom: 16 }}>
                          <div style={{
                            position: 'absolute', left: -19, top: 4,
                            width: 8, height: 8, borderRadius: '50%',
                            backgroundColor: dotColor,
                            border: '2px solid #fafaf9',
                          }} />
                          <p style={{ fontSize: 11, color: '#a8a29e', margin: '0 0 2px' }}>
                            {log.createdAt && format(new Date(log.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            {log.userName && <> · <span style={{ color: '#78716c', fontWeight: 600 }}>{log.userName}</span></>}
                          </p>
                          <p style={{ fontSize: 13, color: '#1c1917', fontWeight: 500, margin: 0 }}>
                            {log.details || log.action || 'Ação registrada'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── FOOTER ── */}
              <div style={{
                padding: '16px 24px', backgroundColor: '#ffffff',
                borderTop: '1px solid #e7e5e4',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <p style={{ fontSize: 12, color: '#a8a29e', margin: 0 }}>
                  {sponsors.length > 0
                    ? 'Use os botões individuais acima para aprovar/reprovar'
                    : 'Revise o conteúdo antes de aprovar ou reprovar'}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {/* General approve/reject for items without sponsors */}
                  {sponsors.length === 0 && selectedItem && (
                    <>
                      <button
                        onClick={handleReject}
                        disabled={sponsorRejectMutation.isPending}
                        data-testid="button-reject"
                        style={{
                          backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
                          borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600,
                          cursor: 'pointer', transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#dc2626'; e.currentTarget.style.color = '#ffffff'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fef2f2'; e.currentTarget.style.color = '#dc2626'; }}
                      >
                        <XCircle style={{ width: 14, height: 14, display: 'inline', marginRight: 6 }} />
                        {sponsorRejectMutation.isPending ? 'Reprovando...' : 'Reprovar'}
                      </button>
                      <button
                        onClick={handleApprove}
                        disabled={sponsorApproveMutation.isPending}
                        data-testid="button-approve"
                        style={{
                          backgroundColor: '#1c1917', color: '#ffffff',
                          border: 'none', borderRadius: 8, padding: '8px 16px',
                          fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f97316'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#1c1917'; }}
                      >
                        <CheckCircle style={{ width: 14, height: 14, display: 'inline', marginRight: 6 }} />
                        {sponsorApproveMutation.isPending ? 'Aprovando...' : 'Aprovar'}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setDialogOpen(false)}
                    data-testid="button-cancel"
                    style={{
                      backgroundColor: '#fafaf9', border: '1px solid #e7e5e4', color: '#1c1917',
                      borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 500,
                      cursor: 'pointer', transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#1c1917'; e.currentTarget.style.color = '#ffffff'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fafaf9'; e.currentTarget.style.color = '#1c1917'; }}
                  >
                    Fechar
                  </button>
                </div>
              </div>

            </div>
            );
          })()}

        </DialogContent>
      </Dialog>
    </div>
  );
}
