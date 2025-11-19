import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo } from "react";
import { Package, Check, Calendar, Truck, Link2, AlertCircle, CheckCircle2, X, Building2, Plus, Search, Filter, Users, FileText, ClipboardList, History, CircleDot, Circle, Save, Send } from "lucide-react";
import { format, isAfter, startOfDay, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { StatusBadge } from "@/components/status-badge";
import { CommentsSection } from "@/components/comments-section";

type ItemChanges = {
  sponsorIds: string[];
  skipApproval: boolean;
  isDirty: boolean;
};

// Paleta de cores para patrocinadores
const SPONSOR_COLORS = [
  { bg: "bg-blue-500/10", text: "text-blue-700 dark:text-blue-400", border: "border-blue-500/20" },
  { bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-500/20" },
  { bg: "bg-violet-500/10", text: "text-violet-700 dark:text-violet-400", border: "border-violet-500/20" },
  { bg: "bg-orange-500/10", text: "text-orange-700 dark:text-orange-400", border: "border-orange-500/20" },
  { bg: "bg-pink-500/10", text: "text-pink-700 dark:text-pink-400", border: "border-pink-500/20" },
  { bg: "bg-cyan-500/10", text: "text-cyan-700 dark:text-cyan-400", border: "border-cyan-500/20" },
  { bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-400", border: "border-amber-500/20" },
  { bg: "bg-rose-500/10", text: "text-rose-700 dark:text-rose-400", border: "border-rose-500/20" },
  { bg: "bg-indigo-500/10", text: "text-indigo-700 dark:text-indigo-400", border: "border-indigo-500/20" },
  { bg: "bg-teal-500/10", text: "text-teal-700 dark:text-teal-400", border: "border-teal-500/20" },
];

// Função para obter cor consistente de um patrocinador
const getSponsorColor = (sponsorId: string, allSponsors: any[]) => {
  const index = allSponsors.findIndex(s => s.id === sponsorId);
  // Se não encontrar, usar cor padrão (primeira cor)
  if (index === -1) {
    return SPONSOR_COLORS[0];
  }
  return SPONSOR_COLORS[index % SPONSOR_COLORS.length];
};

export default function VincularPatrocinadores() {
  const { toast } = useToast();
  const [itemSponsorsMap, setItemSponsorsMap] = useState<Record<string, string[]>>({});
  const [selectedEventForSponsors, setSelectedEventForSponsors] = useState<any>(null);
  const [selectedSponsorIds, setSelectedSponsorIds] = useState<string[]>([]);
  const [sponsorDialogOpen, setSponsorDialogOpen] = useState(false);
  
  // Estado para dialog de detalhes do item
  const [selectedItemForDetails, setSelectedItemForDetails] = useState<any>(null);
  
  // Estados de filtro
  const [searchQuery, setSearchQuery] = useState("");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [sponsorFilter, setSponsorFilter] = useState<string>("all");
  const [itemFilter, setItemFilter] = useState<string>("all");
  
  // Estado local para rastrear mudanças pendentes
  const [pendingChanges, setPendingChanges] = useState<Record<string, ItemChanges>>({});
  
  // Estados para seleção em lote
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [bulkApplyDialogOpen, setBulkApplyDialogOpen] = useState(false);
  const [bulkSelectedSponsors, setBulkSelectedSponsors] = useState<string[]>([]);
  const [bulkSkipApproval, setBulkSkipApproval] = useState(false);

  const { data: items = [], isLoading: itemsLoading } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const { data: rawEvents = [] } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs"],
  });

  const { data: sponsors = [] } = useQuery<any[]>({
    queryKey: ["/api/sponsors"],
  });

  // Filtrar apenas eventos futuros (data de início >= hoje)
  const events = useMemo(() => {
    const today = startOfDay(new Date());
    return rawEvents.filter(event => {
      const eventStartDate = startOfDay(new Date(event.startDate));
      return isAfter(eventStartDate, today) || eventStartDate.getTime() === today.getTime();
    });
  }, [rawEvents]);

  // Mostrar TODOS os items de eventos futuros (visibilidade)
  // Editável apenas se status: requested, awaiting_sponsor_approval, sponsor_approved, awaiting_creator_review
  const visibleItems = useMemo(() => {
    const today = startOfDay(new Date());
    return items.filter(item => {
      const event = rawEvents.find(e => e.id === item.eventId);
      if (!event) return false;
      const eventStartDate = startOfDay(new Date(event.startDate));
      return isAfter(eventStartDate, today) || eventStartDate.getTime() === today.getTime();
    });
  }, [items, rawEvents]);
  
  // Determinar quais items são editáveis (baseado no status)
  const getItemEditability = (item: any) => {
    const editableStatuses = ['requested', 'awaiting_sponsor_approval', 'sponsor_approved', 'awaiting_creator_review'];
    return editableStatuses.includes(item.status);
  };

  // Agrupar items por evento
  const itemsByEvent = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    visibleItems.forEach(item => {
      if (!grouped[item.eventId]) {
        grouped[item.eventId] = [];
      }
      grouped[item.eventId].push(item);
    });
    return grouped;
  }, [visibleItems]);

  // Lista de tipos únicos de items
  const itemTypes = useMemo(() => {
    const types = new Set<string>();
    visibleItems.forEach(item => types.add(item.type));
    return Array.from(types).sort();
  }, [visibleItems]);

  // Função helper para filtrar items (aplicada tanto na lógica de filtros quanto no render)
  const filterItems = (eventItems: any[], eventName?: string) => {
    return eventItems.filter(item => {
      // Filtro de busca (tipo ou descrição do item, ou nome do evento)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const typeMatch = item.type.toLowerCase().includes(query);
        const descMatch = item.description?.toLowerCase().includes(query) || false;
        const eventMatch = eventName?.toLowerCase().includes(query) || false;
        
        // Item passa se corresponder tipo, descrição, OU se o evento corresponder
        if (!typeMatch && !descMatch && !eventMatch) {
          return false;
        }
      }

      // Filtro por tipo de item
      if (itemFilter !== "all" && item.type !== itemFilter) {
        return false;
      }

      // Filtro por patrocinador
      if (sponsorFilter !== "all") {
        const itemSponsors = itemSponsorsMap[item.id] || [];
        if (!itemSponsors.includes(sponsorFilter)) {
          return false;
        }
      }

      return true;
    });
  };

  // Aplicar filtros
  const filteredEventEntries = useMemo(() => {
    const entries = Object.entries(itemsByEvent);
    
    return entries.filter(([eventId, eventItems]) => {
      const event = events.find(e => e.id === eventId);
      if (!event) return false;

      // Filtro por evento específico
      if (eventFilter !== "all" && eventId !== eventFilter) {
        return false;
      }

      // Filtrar items usando a função helper
      const filteredItems = filterItems(eventItems, event.name);

      // Se não há items que passaram no filtro, ocultar o evento
      return filteredItems.length > 0;
    });
  }, [itemsByEvent, events, searchQuery, eventFilter, sponsorFilter, itemFilter, itemSponsorsMap]);

  // Estado para armazenar sponsors originais (do banco de dados)
  const [originalSponsorsMap, setOriginalSponsorsMap] = useState<Record<string, string[]>>({});

  // Carregar sponsors de todos os items visíveis (não apenas requested)
  useEffect(() => {
    if (itemsLoading || !visibleItems || visibleItems.length === 0) {
      return;
    }

    let cancelled = false;
    
    Promise.all(
      visibleItems.map(async (item) => {
        try {
          const response = await apiRequest("GET", `/api/items/${item.id}/sponsors`);
          const itemSponsors = await response.json();
          const sponsorIds = itemSponsors.map((is: any) => is.sponsorId);
          return { itemId: item.id, sponsorIds };
        } catch (error) {
          console.error(`Erro ao carregar patrocinadores do item ${item.id}:`, error);
          return { itemId: item.id, sponsorIds: [] };
        }
      })
    ).then(results => {
      if (cancelled) return;
      
      const newMap = results.reduce((acc, { itemId, sponsorIds }) => ({
        ...acc,
        [itemId]: sponsorIds
      }), {});
      
      setItemSponsorsMap(newMap);
      setOriginalSponsorsMap(newMap);
    }).catch(error => {
      console.error('Erro ao carregar sponsors:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [visibleItems.length, itemsLoading]);

  // Helper para comparar arrays de sponsor IDs
  const areSponsorsEqual = (a: string[], b: string[]): boolean => {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((id, index) => id === sortedB[index]);
  };

  // Mutation para sincronizar patrocinadores
  const syncItemSponsorsMutation = useMutation({
    mutationFn: async ({ itemId, sponsorIds }: { itemId: string, sponsorIds: string[] }) => {
      await apiRequest("POST", `/api/items/${itemId}/sponsors/sync`, { sponsorIds });
    },
    onMutate: async ({ itemId, sponsorIds }) => {
      setItemSponsorsMap(prev => ({
        ...prev,
        [itemId]: sponsorIds
      }));
    },
    onSuccess: async (_, { itemId }) => {
      try {
        const response = await apiRequest("GET", `/api/items/${itemId}/sponsors`);
        const itemSponsors = await response.json();
        const sponsorIds = itemSponsors.map((is: any) => is.sponsorId);
        
        // Atualizar tanto o mapa atual quanto o original
        setItemSponsorsMap(prev => ({
          ...prev,
          [itemId]: sponsorIds
        }));
        
        setOriginalSponsorsMap(prev => ({
          ...prev,
          [itemId]: sponsorIds
        }));

        toast({
          title: "Atualizado!",
          description: "Patrocinadores vinculados com sucesso",
        });
      } catch (error) {
        console.error(`Erro ao recarregar sponsors do item ${itemId}:`, error);
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar patrocinadores",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para atualizar skipApproval
  const updateItemSkipApprovalMutation = useMutation({
    mutationFn: async ({ itemId, skipApproval }: { itemId: string, skipApproval: boolean }) => {
      await apiRequest("PATCH", `/api/items/${itemId}`, { skipApproval });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({
        title: "Atualizado",
        description: "Configuração de aprovação atualizada",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para gerenciar patrocinadores do evento
  const manageEventSponsorsMutation = useMutation({
    mutationFn: async ({ eventId, currentSponsors, newSponsors }: { 
      eventId: string, 
      currentSponsors: string[], 
      newSponsors: string[] 
    }) => {
      const toAdd = newSponsors.filter(id => !currentSponsors.includes(id));
      const toRemove = currentSponsors.filter(id => !newSponsors.includes(id));
      
      // Adicionar novos patrocinadores
      for (const sponsorId of toAdd) {
        await apiRequest("POST", `/api/events/${eventId}/sponsors`, { sponsorId });
      }
      
      // Remover patrocinadores desmarcados
      for (const sponsorId of toRemove) {
        await apiRequest("DELETE", `/api/events/${eventId}/sponsors/${sponsorId}`);
      }
    },
    onSuccess: async () => {
      // Invalidar e fazer refetch forçado
      queryClient.removeQueries({ queryKey: ["/api/events"] });
      await queryClient.refetchQueries({ queryKey: ["/api/events"], type: 'active' });
      setSponsorDialogOpen(false);
      toast({
        title: "✅ Patrocinadores atualizados!",
        description: "Os patrocinadores foram vinculados ao evento",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar patrocinadores",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation 1: Salvar vinculação (patrocinadores + skipApproval) SEM mudar status
  const saveLinkingMutation = useMutation({
    mutationFn: async (itemIdsToSave: string[]) => {
      const validItemIds = itemIdsToSave.filter(itemId => {
        const item = visibleItems.find(i => i.id === itemId);
        if (!item || !getItemEditability(item)) return false;
        
        const changes = pendingChanges[itemId];
        return changes && changes.isDirty;
      });

      if (validItemIds.length === 0) {
        throw new Error("Nenhum item válido para salvar");
      }

      for (const itemId of validItemIds) {
        const changes = pendingChanges[itemId];

        // 1. Sincronizar patrocinadores
        await apiRequest("POST", `/api/items/${itemId}/sponsors/sync`, {
          sponsorIds: changes.sponsorIds
        });

        // 2. Atualizar APENAS skipApproval, NÃO mudar o status
        await apiRequest("PATCH", `/api/items/${itemId}`, {
          skipApproval: changes.skipApproval
        });
      }
      
      return validItemIds;
    },
    onSuccess: async (validItemIds) => {
      // Limpar pendingChanges
      setPendingChanges(prev => {
        const newChanges = { ...prev };
        validItemIds.forEach(id => {
          delete newChanges[id];
        });
        return newChanges;
      });

      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      
      // Recarregar patrocinadores
      const sponsorResults = await Promise.all(
        validItemIds.map(async (itemId) => {
          try {
            const response = await apiRequest("GET", `/api/items/${itemId}/sponsors`);
            const itemSponsors = await response.json();
            const sponsorIds = itemSponsors.map((is: any) => is.sponsorId);
            return { itemId, sponsorIds };
          } catch (error) {
            console.error(`Erro ao recarregar sponsors do item ${itemId}:`, error);
            return { itemId, sponsorIds: [] };
          }
        })
      );
      
      setOriginalSponsorsMap(prev => {
        const newMap = { ...prev };
        sponsorResults.forEach(({ itemId, sponsorIds }) => {
          newMap[itemId] = sponsorIds;
        });
        return newMap;
      });
      
      toast({
        title: "✅ Vinculação confirmada!",
        description: `${validItemIds.length} item${validItemIds.length !== 1 ? 's' : ''} confirmado${validItemIds.length !== 1 ? 's' : ''}. Clique em "Enviar para Arte" para avançar.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar vinculação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation 2: Enviar items para Arte (mudar status)
  const sendToArteMutation = useMutation({
    mutationFn: async (itemIdsToSend: string[]) => {
      const validItemIds = itemIdsToSend.filter(itemId => {
        const item = visibleItems.find(i => i.id === itemId);
        if (!item || !getItemEditability(item)) return false;
        
        // Item deve estar em status que ainda não foi enviado para Arte
        return item.status === "requested" || item.status === "awaiting_linking";
      });

      if (validItemIds.length === 0) {
        throw new Error("Nenhum item válido para enviar");
      }

      for (const itemId of validItemIds) {
        await apiRequest("PATCH", `/api/items/${itemId}`, {
          status: "awaiting_submission"
        });
      }
      
      return validItemIds;
    },
    onSuccess: async (validItemIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      
      toast({
        title: "✅ Items enviados para Arte!",
        description: `${validItemIds.length} item${validItemIds.length !== 1 ? 's' : ''} enviado${validItemIds.length !== 1 ? 's' : ''} para Arte`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar para Arte",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleOpenSponsorDialog = (event: any) => {
    setSelectedEventForSponsors(event);
    const eventSponsors = getEventSponsors(event.id);
    setSelectedSponsorIds(eventSponsors.map(s => s.id));
    setSponsorDialogOpen(true);
  };

  const handleSaveEventSponsors = () => {
    if (!selectedEventForSponsors) return;
    
    const currentSponsors = getEventSponsors(selectedEventForSponsors.id).map(s => s.id);
    
    manageEventSponsorsMutation.mutate({
      eventId: selectedEventForSponsors.id,
      currentSponsors,
      newSponsors: selectedSponsorIds,
    });
  };

  // Normalizar patrocinadores do evento (event.sponsors é array de objetos relation)
  const eventSponsorMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    rawEvents.forEach(event => {
      if (event.sponsors && Array.isArray(event.sponsors)) {
        map[event.id] = event.sponsors.map((rel: any) => rel.sponsorId);
      } else {
        map[event.id] = [];
      }
    });
    return map;
  }, [rawEvents]);

  const getEventSponsors = (eventId: string) => {
    const sponsorIds = eventSponsorMap[eventId] || [];
    return sponsors.filter(sponsor => sponsorIds.includes(sponsor.id));
  };

  // Funções para seleção em lote
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

  const toggleAllItemsInEvent = (eventItems: any[]) => {
    const eventItemIds = eventItems.map(item => item.id);
    const allSelected = eventItemIds.every(id => selectedItemIds.has(id));
    
    setSelectedItemIds(prev => {
      const newSet = new Set(prev);
      if (allSelected) {
        eventItemIds.forEach(id => newSet.delete(id));
      } else {
        eventItemIds.forEach(id => newSet.add(id));
      }
      return newSet;
    });
  };

  const handleOpenBulkApplyDialog = () => {
    setBulkSelectedSponsors([]);
    setBulkSkipApproval(false);
    setBulkApplyDialogOpen(true);
  };

  const handleApplyBulkSponsors = () => {
    const allSelectedItems = Array.from(selectedItemIds);
    
    // FILTRAR: NÃO aplicar em lote em items que JÁ têm patrocinadores vinculados
    const itemsAlreadyLinked: string[] = [];
    const itemsToUpdate: string[] = [];
    
    allSelectedItems.forEach(itemId => {
      const linkedSponsors = itemSponsorsMap[itemId] || [];
      const hasPendingChanges = pendingChanges[itemId]?.isDirty;
      const item = items.find(i => i.id === itemId);
      const hasSkipApproval = item?.skipApproval || false;
      
      // Item já tem:
      // - patrocinadores vinculados (individual)
      // - mudanças pendentes
      // - marcado como "sem aprovação" (skipApproval)
      if (linkedSponsors.length > 0 || hasPendingChanges || hasSkipApproval) {
        itemsAlreadyLinked.push(itemId);
      } else {
        itemsToUpdate.push(itemId);
      }
    });
    
    // Se todos os items já estão vinculados, avisar e não fazer nada
    if (itemsToUpdate.length === 0) {
      toast({
        title: "⚠️ Nenhum item para atualizar",
        description: "Todos os items selecionados já foram processados (patrocinadores vinculados ou marcados como 'sem aprovação').",
        variant: "destructive",
      });
      setBulkApplyDialogOpen(false);
      return;
    }
    
    // Aplicar patrocinadores APENAS aos items que ainda não têm vinculação
    itemsToUpdate.forEach(itemId => {
      const originalSponsors = originalSponsorsMap[itemId] || [];
      const originalSkipApproval = items.find(i => i.id === itemId)?.skipApproval || false;
      
      const hasChanges = 
        !areSponsorsEqual(bulkSelectedSponsors, originalSponsors) ||
        bulkSkipApproval !== originalSkipApproval;
      
      if (hasChanges) {
        setPendingChanges(prev => ({
          ...prev,
          [itemId]: {
            sponsorIds: bulkSelectedSponsors,
            skipApproval: bulkSkipApproval,
            isDirty: true
          }
        }));
        
        setItemSponsorsMap(prev => ({
          ...prev,
          [itemId]: bulkSelectedSponsors
        }));
      }
    });

    // Limpar seleção e fechar modal
    setSelectedItemIds(new Set());
    setBulkApplyDialogOpen(false);
    
    // Mensagem de sucesso com aviso se alguns items foram ignorados
    const message = itemsAlreadyLinked.length > 0
      ? `${itemsToUpdate.length} item${itemsToUpdate.length !== 1 ? 's' : ''} atualizado${itemsToUpdate.length !== 1 ? 's' : ''}. ${itemsAlreadyLinked.length} item${itemsAlreadyLinked.length !== 1 ? 's' : ''} ignorado${itemsAlreadyLinked.length !== 1 ? 's' : ''} (já processado${itemsAlreadyLinked.length !== 1 ? 's' : ''}).`
      : `Patrocinadores aplicados a ${itemsToUpdate.length} item${itemsToUpdate.length !== 1 ? 's' : ''}`;
    
    toast({
      title: "✅ Aplicado com sucesso!",
      description: message,
    });
  };

  // Calcular progresso
  const getItemStatus = (item: any) => {
    const changes = pendingChanges[item.id];
    const linkedSponsors = itemSponsorsMap[item.id] || [];
    
    // NÃO considerar o status baseado em mudanças pendentes aqui
    // O badge "Pronto" é mostrado separadamente quando pendingChanges[item.id]?.isDirty é true
    
    // Verificar o estado SALVO no banco de dados (não pendente)
    // Usar os valores do banco, não do estado local
    const originalSponsors = originalSponsorsMap[item.id] || [];
    const originalSkipApproval = item.skipApproval || false;
    
    // Verificar skipApproval e patrocinadores vinculados independente do status
    // Isso funciona tanto para items 'requested' quanto para items já confirmados
    if (originalSkipApproval) return 'skip';
    if (originalSponsors.length > 0) return 'linked';
    
    return 'pending';
  };

  const calculateProgress = (eventItems: any[]) => {
    const completed = eventItems.filter(item => {
      const status = getItemStatus(item);
      return status === 'linked' || status === 'skip';
    }).length;
    return { completed, total: eventItems.length };
  };

  if (itemsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando items...</p>
        </div>
      </div>
    );
  }

  if (visibleItems.length === 0) {
    return (
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Vincular Patrocinadores</h1>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              Nenhum item de eventos futuros encontrado
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }


  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Vincular Patrocinadores</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vincule patrocinadores aos items ou marque como "sem aprovação"
        </p>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Filtro por Evento */}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Evento</label>
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger data-testid="select-event-filter">
                  <SelectValue placeholder="Selecione evento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os eventos</SelectItem>
                  {events.map(event => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filtro por Patrocinador */}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Patrocinador</label>
              <Select value={sponsorFilter} onValueChange={setSponsorFilter}>
                <SelectTrigger data-testid="select-sponsor-filter">
                  <SelectValue placeholder="Selecione patrocinador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os patrocinadores</SelectItem>
                  {sponsors.map(sponsor => (
                    <SelectItem key={sponsor.id} value={sponsor.id}>
                      {sponsor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filtro por Item (tipo) */}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Item</label>
              <Select value={itemFilter} onValueChange={setItemFilter}>
                <SelectTrigger data-testid="select-item-filter">
                  <SelectValue placeholder="Selecione tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {itemTypes.map(type => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Busca */}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nome..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-events"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Botão de Aplicar em Lote */}
      {selectedItemIds.size > 0 && (
        <Card className="mb-6 border-primary/50 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">{selectedItemIds.size}</span>
                  </div>
                  <span className="font-medium">
                    {selectedItemIds.size} item{selectedItemIds.size !== 1 ? 's' : ''} selecionado{selectedItemIds.size !== 1 ? 's' : ''}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedItemIds(new Set())}
                  data-testid="button-clear-selection"
                >
                  Limpar seleção
                </Button>
              </div>
              <Button
                onClick={handleOpenBulkApplyDialog}
                className="gap-2"
                data-testid="button-apply-bulk-sponsors"
              >
                <Users className="h-4 w-4" />
                Aplicar Patrocinadores
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cards de Eventos - Matriz Visual */}
      <div className="space-y-6">
        {filteredEventEntries.map(([eventId, eventItems]) => {
          const event = events.find(e => e.id === eventId);
          const eventSponsors = getEventSponsors(eventId);
          
          // Usar a mesma função de filtro para garantir consistência
          const displayedItems = filterItems(eventItems, event?.name);

          const progress = calculateProgress(displayedItems);

          if (!event) return null;

          return (
            <Card key={eventId}>
              {/* Header do Evento - Compacto */}
              <CardHeader className="border-b p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <CardTitle className="text-base truncate">{event.name}</CardTitle>
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {progress.completed}/{progress.total}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>{format(new Date(event.startDate), "dd/MM/yyyy", { locale: ptBR })}</span>
                      <span>•</span>
                      <Truck className="h-3 w-3" />
                      <span>{format(new Date(event.truckDepartureDate), "dd/MM HH:mm", { locale: ptBR })}</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenSponsorDialog(event)}
                    className="gap-1.5 shrink-0"
                    data-testid={`button-manage-event-sponsors-${event.id}`}
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    {eventSponsors.length === 0 ? 'Adicionar' : `${eventSponsors.length} Pat.`}
                  </Button>
                </div>

                {/* Patrocinadores do Evento - Badges Compactos com Cores */}
                {eventSponsors.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {eventSponsors.map(sponsor => {
                      const colors = getSponsorColor(sponsor.id, sponsors);
                      return (
                        <Badge 
                          key={sponsor.id} 
                          variant="secondary" 
                          className={`text-xs gap-1 ${colors.bg} ${colors.text} ${colors.border}`}
                        >
                          <Building2 className="h-3 w-3" />
                          {sponsor.name}
                        </Badge>
                      );
                    })}
                  </div>
                )}

              </CardHeader>

              {/* Botão 1: Confirmar Vinculação (salvar patrocinadores) */}
              {Object.keys(pendingChanges).filter(id => 
                eventItems.some(item => item.id === id) && pendingChanges[id].isDirty
              ).length > 0 && (
                <div className="px-4 py-3 bg-yellow-500/5 border-y border-yellow-500/20">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm">
                      <span className="font-semibold text-yellow-700 dark:text-yellow-500">
                        {Object.keys(pendingChanges).filter(id => 
                          eventItems.some(item => item.id === id) && pendingChanges[id].isDirty
                        ).length} item{Object.keys(pendingChanges).filter(id => 
                          eventItems.some(item => item.id === id) && pendingChanges[id].isDirty
                        ).length !== 1 ? 's' : ''} com altera{Object.keys(pendingChanges).filter(id => 
                          eventItems.some(item => item.id === id) && pendingChanges[id].isDirty
                        ).length !== 1 ? 'ções' : 'ção'}
                      </span>
                      <span className="text-muted-foreground ml-2">→ Clique para salvar</span>
                    </div>
                    <Button
                      size="sm"
                      className="gap-2 shrink-0"
                      onClick={() => {
                        const dirtyItemIds = Object.keys(pendingChanges).filter(id => 
                          eventItems.some(item => item.id === id) && pendingChanges[id].isDirty
                        );
                        saveLinkingMutation.mutate(dirtyItemIds);
                      }}
                      disabled={saveLinkingMutation.isPending}
                      data-testid="button-save-linking"
                    >
                      <Save className="h-4 w-4" />
                      {saveLinkingMutation.isPending ? "Salvando..." : "Confirmar Vinculação"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Botão 2: Enviar para Arte (mudar status) */}
              {(() => {
                const confirmedButNotSent = eventItems.filter(item => {
                  const hasPendingChanges = pendingChanges[item.id]?.isDirty;
                  const isInVinculacaoStatus = item.status === "requested" || item.status === "awaiting_linking";
                  const linkedSponsors = itemSponsorsMap[item.id] || [];
                  const hasLinkedSponsorsOrSkip = linkedSponsors.length > 0 || item.skipApproval;
                  
                  return !hasPendingChanges && isInVinculacaoStatus && hasLinkedSponsorsOrSkip;
                });

                return confirmedButNotSent.length > 0 && (
                  <div className="px-4 py-3 bg-blue-500/5 border-y border-blue-500/20">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm">
                        <span className="font-semibold text-blue-700 dark:text-blue-500">
                          {confirmedButNotSent.length} item{confirmedButNotSent.length !== 1 ? 's' : ''} confirmado{confirmedButNotSent.length !== 1 ? 's' : ''}
                        </span>
                        <span className="text-muted-foreground ml-2">→ Pronto para Arte</span>
                      </div>
                      <Button
                        size="sm"
                        variant="default"
                        className="gap-2 shrink-0"
                        onClick={() => {
                          const itemIds = confirmedButNotSent.map(item => item.id);
                          sendToArteMutation.mutate(itemIds);
                        }}
                        disabled={sendToArteMutation.isPending}
                        data-testid="button-send-to-arte"
                      >
                        <Send className="h-4 w-4" />
                        {sendToArteMutation.isPending ? "Enviando..." : "Enviar para Arte"}
                      </Button>
                    </div>
                  </div>
                );
              })()}

              {/* Tabela de Items - Compacta */}
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b bg-muted/30">
                      <tr>
                        <th className="px-3 py-2 text-center w-[50px]">
                          <Checkbox
                            checked={displayedItems.filter(item => getItemEditability(item)).length > 0 && displayedItems.filter(item => getItemEditability(item)).every(item => selectedItemIds.has(item.id))}
                            onCheckedChange={() => toggleAllItemsInEvent(displayedItems.filter(item => getItemEditability(item)))}
                            disabled={displayedItems.filter(item => getItemEditability(item)).length === 0}
                            data-testid={`checkbox-select-all-${event.id}`}
                          />
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">ID</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Item</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Detalhes</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Patrocinadores</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Sem Aprov.</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedItems.map(item => {
                        const itemStatus = getItemStatus(item);
                        const linkedSponsors = itemSponsorsMap[item.id] || [];
                        const currentSkipApproval = pendingChanges[item.id]?.skipApproval ?? (item.skipApproval || false);
                        const isEditable = getItemEditability(item);

                        return (
                          <tr
                            key={item.id}
                            className={`border-b hover:bg-muted/30 transition-colors cursor-pointer ${
                              itemStatus === 'linked' || itemStatus === 'skip'
                                ? 'bg-green-50/50 dark:bg-green-900/10'
                                : ''
                            } ${!isEditable ? 'opacity-60' : ''}`}
                            onClick={() => setSelectedItemForDetails(item)}
                            data-testid={`item-row-${item.id}`}
                          >
                            <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedItemIds.has(item.id)}
                                onCheckedChange={() => isEditable && linkedSponsors.length === 0 && toggleItemSelection(item.id)}
                                disabled={!isEditable || linkedSponsors.length > 0}
                                data-testid={`checkbox-item-${item.id}`}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <div className="text-xs font-mono font-medium text-primary whitespace-nowrap" data-testid={`text-display-id-${item.id}`}>
                                {item.displayId}
                              </div>
                            </td>
                            <td className="px-3 py-2 min-w-[200px]">
                              <div>
                                <div className="font-medium text-sm text-foreground">{item.type}</div>
                                {item.description && (
                                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                    {item.description}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="text-xs">
                                <span className="font-medium">{item.quantity} un</span>
                                <span className="text-muted-foreground mx-1.5">•</span>
                                <span className="text-muted-foreground">{parseFloat(item.calculatedM2).toFixed(2)} m²</span>
                              </div>
                            </td>
                            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                              {/* Seleção múltipla com CHECKBOXES */}
                              {!currentSkipApproval && eventSponsors.length > 0 && (
                                <div className="space-y-0.5">
                                  {eventSponsors.map(sponsor => {
                                    const isLinked = linkedSponsors.includes(sponsor.id);
                                    const colors = getSponsorColor(sponsor.id, sponsors);
                                    return (
                                      <div key={sponsor.id} className="flex items-center gap-1.5">
                                        <Checkbox
                                          checked={isLinked}
                                          disabled={!isEditable}
                                          onCheckedChange={(checked) => {
                                            if (!isEditable) return;
                                            
                                            const newSponsors = checked
                                              ? [...linkedSponsors, sponsor.id]
                                              : linkedSponsors.filter(id => id !== sponsor.id);
                                            
                                            const originalSponsors = originalSponsorsMap[item.id] || [];
                                            const originalSkipApproval = item.skipApproval || false;
                                            const currentSkipApproval = pendingChanges[item.id]?.skipApproval ?? originalSkipApproval;
                                            
                                            const hasChanges = 
                                              !areSponsorsEqual(newSponsors, originalSponsors) ||
                                              currentSkipApproval !== originalSkipApproval;
                                            
                                            // Atualizar estado local - se não houver mudanças, REMOVER do pendingChanges
                                            setPendingChanges(prev => {
                                              if (!hasChanges) {
                                                const newChanges = { ...prev };
                                                delete newChanges[item.id];
                                                return newChanges;
                                              }
                                              return {
                                                ...prev,
                                                [item.id]: {
                                                  sponsorIds: newSponsors,
                                                  skipApproval: currentSkipApproval,
                                                  isDirty: true
                                                }
                                              };
                                            });
                                            
                                            // Atualizar mapa de patrocinadores (visual)
                                            setItemSponsorsMap(prev => ({
                                              ...prev,
                                              [item.id]: newSponsors
                                            }));
                                          }}
                                          data-testid={`checkbox-sponsor-${item.id}-${sponsor.id}`}
                                        />
                                        <label className={`text-xs font-medium ${colors.text} ${!isEditable ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                          {sponsor.name}
                                        </label>
                                      </div>
                                    );
                                  })}
                                  {linkedSponsors.length > 0 && (
                                    <div className="text-xs text-primary font-medium mt-1">
                                      ✓ {linkedSponsors.length} selecionado{linkedSponsors.length !== 1 ? 's' : ''}
                                    </div>
                                  )}
                                </div>
                              )}
                              {!currentSkipApproval && eventSponsors.length === 0 && (
                                <span className="text-xs text-muted-foreground italic">
                                  Adicione patrocinadores ao evento
                                </span>
                              )}
                              {currentSkipApproval && (
                                <Badge variant="secondary" className="text-xs">
                                  Sem patrocinador
                                </Badge>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={currentSkipApproval}
                                disabled={!isEditable}
                                onCheckedChange={(checked) => {
                                  if (!isEditable) return;
                                  
                                  const originalSponsors = originalSponsorsMap[item.id] || [];
                                  const originalSkipApproval = item.skipApproval || false;
                                  const currentSponsors = pendingChanges[item.id]?.sponsorIds || linkedSponsors;
                                  const newSkipApproval = !!checked;
                                  
                                  const hasChanges = 
                                    !areSponsorsEqual(currentSponsors, originalSponsors) ||
                                    newSkipApproval !== originalSkipApproval;
                                  
                                  // Atualizar estado local - se não houver mudanças, REMOVER do pendingChanges
                                  setPendingChanges(prev => {
                                    if (!hasChanges) {
                                      const newChanges = { ...prev };
                                      delete newChanges[item.id];
                                      return newChanges;
                                    }
                                    return {
                                      ...prev,
                                      [item.id]: {
                                        sponsorIds: currentSponsors,
                                        skipApproval: newSkipApproval,
                                        isDirty: true
                                      }
                                    };
                                  });
                                }}
                                data-testid={`checkbox-skip-approval-${item.id}`}
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              {!isEditable ? (
                                <Badge variant="default" className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20 text-xs gap-1">
                                  <Check className="h-3 w-3" />
                                  Aprovado
                                </Badge>
                              ) : pendingChanges[item.id]?.isDirty ? (
                                <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-500 border-yellow-500/20 text-xs">
                                  Pronto
                                </Badge>
                              ) : itemStatus === 'linked' ? (
                                <Badge variant="default" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20 text-xs gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  OK
                                </Badge>
                              ) : itemStatus === 'skip' ? (
                                <Badge variant="default" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20 text-xs gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  OK
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">
                                  Aguardando
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Dialog para Gerenciar Patrocinadores do Evento */}
      <Dialog open={sponsorDialogOpen} onOpenChange={setSponsorDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Gerenciar Patrocinadores do Evento
            </DialogTitle>
            <DialogDescription>
              {selectedEventForSponsors && (
                <span>Selecione os patrocinadores para <strong>{selectedEventForSponsors.name}</strong></span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            {sponsors.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum patrocinador cadastrado no sistema
              </p>
            ) : (
              <div className="space-y-2">
                {sponsors.map((sponsor) => (
                  <div 
                    key={sponsor.id} 
                    className={`flex items-center space-x-3 p-3 border-2 rounded-lg transition-all cursor-pointer hover-elevate ${
                      selectedSponsorIds.includes(sponsor.id)
                        ? 'border-primary bg-primary/5' 
                        : 'border-border bg-background'
                    }`}
                    onClick={() => {
                      if (selectedSponsorIds.includes(sponsor.id)) {
                        setSelectedSponsorIds(selectedSponsorIds.filter(id => id !== sponsor.id));
                      } else {
                        setSelectedSponsorIds([...selectedSponsorIds, sponsor.id]);
                      }
                    }}
                  >
                    <Checkbox
                      id={`event-sponsor-${sponsor.id}`}
                      checked={selectedSponsorIds.includes(sponsor.id)}
                      onCheckedChange={() => {}} // Controlled by div onClick
                      data-testid={`checkbox-event-sponsor-${sponsor.id}`}
                    />
                    <label
                      htmlFor={`event-sponsor-${sponsor.id}`}
                      className="text-sm font-medium leading-tight cursor-pointer flex-1"
                    >
                      {sponsor.name}
                      {sponsor.company && (
                        <span className="text-muted-foreground ml-1">({sponsor.company})</span>
                      )}
                    </label>
                    {selectedSponsorIds.includes(sponsor.id) && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              {selectedSponsorIds.length} {selectedSponsorIds.length === 1 ? 'patrocinador selecionado' : 'patrocinadores selecionados'}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setSponsorDialogOpen(false)}
                disabled={manageEventSponsorsMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveEventSponsors}
                disabled={manageEventSponsorsMutation.isPending}
                data-testid="button-save-event-sponsors"
              >
                {manageEventSponsorsMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog para Aplicar Patrocinadores em Lote */}
      <Dialog open={bulkApplyDialogOpen} onOpenChange={setBulkApplyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Aplicar Patrocinadores em Lote
            </DialogTitle>
            <DialogDescription>
              Selecione os patrocinadores para aplicar aos {selectedItemIds.size} items selecionados
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Lista de Patrocinadores */}
            <div className="space-y-4 max-h-[400px] overflow-y-auto">
              {sponsors.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum patrocinador cadastrado no sistema
                </p>
              ) : (
                <div className="space-y-2">
                  {sponsors.map((sponsor) => {
                    const colors = getSponsorColor(sponsor.id, sponsors);
                    return (
                      <div 
                        key={sponsor.id} 
                        className={`flex items-center space-x-3 p-3 border-2 rounded-lg transition-all cursor-pointer hover-elevate ${
                          bulkSelectedSponsors.includes(sponsor.id)
                            ? `border-primary ${colors.bg}` 
                            : 'border-border bg-background'
                        }`}
                        onClick={() => {
                          if (bulkSelectedSponsors.includes(sponsor.id)) {
                            setBulkSelectedSponsors(bulkSelectedSponsors.filter(id => id !== sponsor.id));
                          } else {
                            setBulkSelectedSponsors([...bulkSelectedSponsors, sponsor.id]);
                          }
                        }}
                      >
                        <Checkbox
                          id={`bulk-sponsor-${sponsor.id}`}
                          checked={bulkSelectedSponsors.includes(sponsor.id)}
                          onCheckedChange={() => {}}
                          data-testid={`checkbox-bulk-sponsor-${sponsor.id}`}
                        />
                        <label
                          htmlFor={`bulk-sponsor-${sponsor.id}`}
                          className={`text-sm font-medium leading-tight cursor-pointer flex-1 ${colors.text}`}
                        >
                          {sponsor.name}
                          {sponsor.company && (
                            <span className="text-muted-foreground ml-1">({sponsor.company})</span>
                          )}
                        </label>
                        {bulkSelectedSponsors.includes(sponsor.id) && (
                          <Check className="h-4 w-4 text-primary shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Opção Skip Approval */}
            <div className="flex items-center justify-between p-3 border-2 rounded-lg bg-muted/30">
              <div className="flex-1">
                <label htmlFor="bulk-skip-approval" className="text-sm font-medium cursor-pointer">
                  Pular aprovação de patrocinadores
                </label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Items irão direto para produção sem aprovação
                </p>
              </div>
              <Switch
                id="bulk-skip-approval"
                checked={bulkSkipApproval}
                onCheckedChange={setBulkSkipApproval}
                data-testid="switch-bulk-skip-approval"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              {bulkSelectedSponsors.length} {bulkSelectedSponsors.length === 1 ? 'patrocinador selecionado' : 'patrocinadores selecionados'}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setBulkApplyDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleApplyBulkSponsors}
                data-testid="button-confirm-bulk-apply"
              >
                Aplicar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Detalhes do Item */}
      <Dialog open={!!selectedItemForDetails} onOpenChange={(open) => !open && setSelectedItemForDetails(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <DialogTitle>Detalhes do Item</DialogTitle>
              {selectedItemForDetails && (
                <>
                  <span className="text-sm font-mono font-medium text-primary">
                    {selectedItemForDetails.displayId}
                  </span>
                  <StatusBadge status={selectedItemForDetails.status} />
                </>
              )}
            </div>
            <DialogDescription>
              Informações completas do item
            </DialogDescription>
          </DialogHeader>
          {selectedItemForDetails && (
            <div className="space-y-2">
              {/* Barra de Progresso Visual */}
              <Card>
                <CardContent className="px-4 py-3">
                  <div className="flex items-center justify-between text-xs">
                    {/* Etapa 1: Vinculação */}
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <div className={`rounded-full p-1 ${
                        ['requested', 'awaiting_linking', 'awaiting_submission', 'awaiting_sponsor_approval', 'sponsor_approved', 'awaiting_approval', 'awaiting_finalization', 'awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered'].includes(selectedItemForDetails.status)
                          ? 'bg-orange-500 text-white' 
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                      }`}>
                        {['awaiting_submission', 'awaiting_sponsor_approval', 'sponsor_approved', 'awaiting_approval', 'awaiting_finalization', 'awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered'].includes(selectedItemForDetails.status) ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : ['requested', 'awaiting_linking'].includes(selectedItemForDetails.status) ? (
                          <CircleDot className="h-3 w-3" />
                        ) : (
                          <Circle className="h-3 w-3" />
                        )}
                      </div>
                      <span className={`text-center ${
                        ['requested', 'awaiting_linking'].includes(selectedItemForDetails.status) ? 'font-semibold text-orange-600 dark:text-orange-400' : 'text-muted-foreground'
                      }`}>
                        Vinculação
                      </span>
                    </div>

                    <div className={`h-[2px] flex-1 ${
                      ['awaiting_submission', 'awaiting_sponsor_approval', 'sponsor_approved', 'awaiting_approval', 'awaiting_finalization', 'awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered'].includes(selectedItemForDetails.status)
                        ? 'bg-orange-500' 
                        : 'bg-gray-200 dark:bg-gray-700'
                    }`} />

                    {/* Etapa 2: Arte */}
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <div className={`rounded-full p-1 ${
                        ['awaiting_submission', 'awaiting_sponsor_approval', 'sponsor_approved', 'awaiting_approval', 'awaiting_finalization', 'awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered'].includes(selectedItemForDetails.status)
                          ? 'bg-purple-500 text-white' 
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                      }`}>
                        {['awaiting_sponsor_approval', 'sponsor_approved', 'awaiting_approval', 'awaiting_finalization', 'awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered'].includes(selectedItemForDetails.status) ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : selectedItemForDetails.status === 'awaiting_submission' ? (
                          <CircleDot className="h-3 w-3" />
                        ) : (
                          <Circle className="h-3 w-3" />
                        )}
                      </div>
                      <span className={`text-center ${
                        selectedItemForDetails.status === 'awaiting_submission' ? 'font-semibold text-purple-600 dark:text-purple-400' : 'text-muted-foreground'
                      }`}>
                        Arte
                      </span>
                    </div>

                    <div className={`h-[2px] flex-1 ${
                      ['awaiting_sponsor_approval', 'sponsor_approved', 'awaiting_approval', 'awaiting_finalization', 'awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered'].includes(selectedItemForDetails.status)
                        ? 'bg-purple-500' 
                        : 'bg-gray-200 dark:bg-gray-700'
                    }`} />

                    {/* Etapa 3: Aprovação */}
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <div className={`rounded-full p-1 ${
                        ['awaiting_sponsor_approval', 'sponsor_approved', 'awaiting_approval', 'awaiting_finalization', 'awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered'].includes(selectedItemForDetails.status)
                          ? 'bg-amber-500 text-white' 
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                      }`}>
                        {['awaiting_finalization', 'awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered'].includes(selectedItemForDetails.status) ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : ['awaiting_sponsor_approval', 'sponsor_approved', 'awaiting_approval'].includes(selectedItemForDetails.status) ? (
                          <CircleDot className="h-3 w-3" />
                        ) : (
                          <Circle className="h-3 w-3" />
                        )}
                      </div>
                      <span className={`text-center ${
                        ['awaiting_sponsor_approval', 'sponsor_approved', 'awaiting_approval'].includes(selectedItemForDetails.status) ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                      }`}>
                        Aprovação
                      </span>
                    </div>

                    <div className={`h-[2px] flex-1 ${
                      ['awaiting_finalization', 'awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered'].includes(selectedItemForDetails.status)
                        ? 'bg-amber-500' 
                        : 'bg-gray-200 dark:bg-gray-700'
                    }`} />

                    {/* Etapa 4: Revisão */}
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <div className={`rounded-full p-1 ${
                        ['awaiting_finalization', 'awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered'].includes(selectedItemForDetails.status)
                          ? 'bg-blue-500 text-white' 
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                      }`}>
                        {['approved', 'inProduction', 'produced', 'delivered'].includes(selectedItemForDetails.status) ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : ['awaiting_finalization', 'awaiting_final_review', 'ready_for_production'].includes(selectedItemForDetails.status) ? (
                          <CircleDot className="h-3 w-3" />
                        ) : (
                          <Circle className="h-3 w-3" />
                        )}
                      </div>
                      <span className={`text-center ${
                        ['awaiting_finalization', 'awaiting_final_review', 'ready_for_production'].includes(selectedItemForDetails.status) ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-muted-foreground'
                      }`}>
                        Revisão
                      </span>
                    </div>

                    <div className={`h-[2px] flex-1 ${
                      ['approved', 'inProduction', 'produced', 'delivered'].includes(selectedItemForDetails.status)
                        ? 'bg-blue-500' 
                        : 'bg-gray-200 dark:bg-gray-700'
                    }`} />

                    {/* Etapa 5: Produção */}
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <div className={`rounded-full p-1 ${
                        ['approved', 'inProduction', 'produced', 'delivered'].includes(selectedItemForDetails.status)
                          ? 'bg-green-500 text-white' 
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                      }`}>
                        {selectedItemForDetails.status === 'delivered' ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : ['approved', 'inProduction', 'produced'].includes(selectedItemForDetails.status) ? (
                          <CircleDot className="h-3 w-3" />
                        ) : (
                          <Circle className="h-3 w-3" />
                        )}
                      </div>
                      <span className={`text-center ${
                        ['approved', 'inProduction', 'produced', 'delivered'].includes(selectedItemForDetails.status) ? 'font-semibold text-green-600 dark:text-green-400' : 'text-muted-foreground'
                      }`}>
                        Produção
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Grid 2 Colunas: Evento e Especificações */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {/* Informações do Evento */}
                <Card>
                  <CardHeader className="px-4 py-2 bg-blue-50/50 dark:bg-blue-950/20">
                    <CardTitle className="text-xs font-semibold uppercase text-blue-700 dark:text-blue-400 flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5" />
                      Evento
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 py-2 pt-0 space-y-1.5 text-sm">
                    <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                      <span className="text-muted-foreground text-xs">Nome do Evento</span>
                      <span className="font-semibold text-right">{selectedItemForDetails.event?.name}</span>
                    </div>
                    <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                      <span className="text-muted-foreground text-xs">Data de Início</span>
                      <span className="font-semibold">
                        {selectedItemForDetails.event?.startDate 
                          ? format(new Date(selectedItemForDetails.event.startDate), "dd/MM/yyyy", { locale: ptBR })
                          : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline py-1">
                      <span className="text-muted-foreground text-xs">Saída do Caminhão</span>
                      <span className="font-semibold">
                        {selectedItemForDetails.event?.truckDepartureDate 
                          ? format(new Date(selectedItemForDetails.event.truckDepartureDate), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                          : "—"}
                      </span>
                    </div>
                    {selectedItemForDetails.event?.truckDepartureDate && (() => {
                      const hoursUntilDeparture = differenceInHours(new Date(selectedItemForDetails.event.truckDepartureDate), new Date());
                      if (hoursUntilDeparture > 0 && hoursUntilDeparture < 48) {
                        const daysRemaining = Math.floor(hoursUntilDeparture / 24);
                        const hoursRemaining = hoursUntilDeparture % 24;
                        return (
                          <div className="pt-2 mt-1 border-t border-border/40">
                            <Badge variant="secondary" className="text-xs">
                              {daysRemaining > 0 ? `${daysRemaining}d ` : ''}{hoursRemaining}h restantes
                            </Badge>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </CardContent>
                </Card>

                {/* Especificações */}
                <Card>
                <CardHeader className="px-4 py-2 bg-purple-50/50 dark:bg-purple-950/20">
                  <CardTitle className="text-xs font-semibold uppercase text-purple-700 dark:text-purple-400 flex items-center gap-2">
                    <ClipboardList className="h-3.5 w-3.5" />
                    Especificações
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 py-2 pt-0 space-y-1.5 text-sm">
                  <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                    <span className="text-muted-foreground text-xs">Tipo</span>
                    <span className="font-semibold text-right">{selectedItemForDetails.type}</span>
                  </div>
                  <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                    <span className="text-muted-foreground text-xs">Material</span>
                    <span className="font-semibold text-right">{selectedItemForDetails.material}</span>
                  </div>
                  <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                    <span className="text-muted-foreground text-xs">Acabamento</span>
                    <span className="font-semibold text-right">{selectedItemForDetails.finish}</span>
                  </div>
                  <div className="flex justify-between items-baseline py-1">
                    <span className="text-muted-foreground text-xs">Descrição</span>
                    <span className="font-semibold text-right">{selectedItemForDetails.description || "—"}</span>
                  </div>
                </CardContent>
              </Card>
              </div>

              {/* Dados de Produção - Linha Inteira */}
              <Card>
                <CardHeader className="px-4 py-2 bg-emerald-50/50 dark:bg-emerald-950/20">
                  <CardTitle className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                    <Package className="h-3.5 w-3.5" />
                    Dados de Produção
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 py-2 pt-0 space-y-1.5 text-sm">
                  <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                    <span className="text-muted-foreground text-xs">Quantidade</span>
                    <span className="font-semibold">{selectedItemForDetails.quantity}</span>
                  </div>
                  <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                    <span className="text-muted-foreground text-xs">Área × Visual</span>
                    <span className="font-semibold">{selectedItemForDetails.area} × {selectedItemForDetails.visual}</span>
                  </div>
                  <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                    <span className="text-muted-foreground text-xs">m² Total</span>
                    <span className="font-semibold">{selectedItemForDetails.calculatedM2}</span>
                  </div>
                  {selectedItemForDetails.measurement && (
                    <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                      <span className="text-muted-foreground text-xs">Medida</span>
                      <span className="font-semibold">{selectedItemForDetails.measurement}</span>
                    </div>
                  )}
                  {selectedItemForDetails.quantityProduced !== null && selectedItemForDetails.quantityProduced > 0 && (
                    <div className="flex justify-between items-baseline py-1">
                      <span className="text-muted-foreground text-xs">Quantidade Produzida</span>
                      <span className="font-semibold text-status-production">{selectedItemForDetails.quantityProduced}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Patrocinadores */}
              {selectedItemForDetails.sponsors && selectedItemForDetails.sponsors.length > 0 && (
                <Card>
                  <CardHeader className="px-4 py-2 bg-orange-50/50 dark:bg-orange-950/20">
                    <CardTitle className="text-xs font-semibold uppercase text-orange-700 dark:text-orange-400 flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5" />
                      Patrocinadores ({selectedItemForDetails.sponsors.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 py-2 pt-0">
                    <div className="flex flex-wrap gap-1.5">
                      {selectedItemForDetails.sponsors.map((sponsor: any) => (
                        <Badge key={sponsor.id} variant="outline" className="text-xs">
                          {sponsor.name}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Observações */}
              {selectedItemForDetails.observations && (
                <Card>
                  <CardHeader className="px-4 py-2 bg-amber-50/50 dark:bg-amber-950/20">
                    <CardTitle className="text-xs font-semibold uppercase text-amber-700 dark:text-amber-400 flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5" />
                      Observações
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 py-2 pt-0">
                    <p className="text-sm whitespace-pre-wrap">{selectedItemForDetails.observations}</p>
                  </CardContent>
                </Card>
              )}

              {/* Histórico de Ações */}
              <Card>
                <CardHeader className="px-4 py-2 bg-slate-50/50 dark:bg-slate-950/20">
                  <CardTitle className="text-xs font-semibold uppercase text-slate-700 dark:text-slate-400 flex items-center gap-2">
                    <History className="h-3.5 w-3.5" />
                    Histórico de Ações
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 py-2 pt-0">
                  <div className="relative">
                    {auditLogs.filter((log: any) => log.entityId === selectedItemForDetails.id).length > 0 ? (
                      <div className="space-y-3">
                        {auditLogs
                          .filter((log: any) => log.entityId === selectedItemForDetails.id)
                          .sort((a: any, b: any) => {
                            const dateA = new Date(a.createdAt || a.timestamp).getTime();
                            const dateB = new Date(b.createdAt || b.timestamp).getTime();
                            return dateB - dateA;
                          })
                          .map((log: any, index: number, array: any[]) => {
                            const timestamp = log.createdAt || log.timestamp;
                            const actionLabels: Record<string, string> = {
                              'created': 'Criado',
                              'updated': 'Atualizado',
                              'approved': 'Aprovado',
                              'rejected': 'Rejeitado',
                              'delivered': 'Entregue',
                              'linked': 'Vinculado',
                              'unlinked': 'Desvinculado',
                              'status_changed': 'Status Alterado',
                              'sponsor_linked': 'Patrocinador Vinculado',
                              'sponsor_unlinked': 'Patrocinador Desvinculado'
                            };
                            const actionLabel = actionLabels[log.action] || log.action;

                            return (
                              <div key={log.id} className="relative flex gap-3">
                                {/* Timeline line */}
                                {index < array.length - 1 && (
                                  <div className="absolute left-2 top-6 bottom-0 w-px bg-border"></div>
                                )}
                                
                                {/* Timeline dot */}
                                <div className="flex-shrink-0 w-4 h-4 rounded-full bg-primary/20 ring-2 ring-primary mt-0.5"></div>
                                
                                {/* Content */}
                                <div className="flex-1 pb-2">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="secondary" className="text-xs font-medium">
                                      {actionLabel}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                      por {log.userName}
                                    </span>
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {timestamp 
                                      ? format(new Date(timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                                      : "Sem registro de horário"}
                                  </div>
                                  {log.details && (
                                    <p className="text-sm mt-1.5 text-foreground/80">{log.details}</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhum histórico disponível</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Comentários */}
              <div className="border-t pt-4">
                <CommentsSection itemId={selectedItemForDetails.id} itemType={selectedItemForDetails.type} />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setSelectedItemForDetails(null)}>
                  Fechar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
