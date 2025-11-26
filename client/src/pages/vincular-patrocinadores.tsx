import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo } from "react";
import { Package, Check, Calendar, Truck, Link2, AlertCircle, CheckCircle2, X, Building2, Plus, Search, Filter, Users, FileText, ClipboardList, History, CircleDot, Circle, Save, Send, ArrowRight, ChevronDown, Info } from "lucide-react";
import { format, isAfter, startOfDay, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { StatusBadge } from "@/components/status-badge";
import { CommentsSection } from "@/components/comments-section";
import { ItemDetailsDialog } from "@/components/item-details-dialog";

type ItemChanges = {
  sponsorIds: string[];
  skipApproval: boolean;
  isDirty: boolean;
};

// Estados UI simplificados
type UIStatus = 'RASCUNHO' | 'PRONTO' | 'ENVIADO' | 'PENDENTE';

// Função para determinar estado UI de um item (FONTE ÚNICA DE VERDADE)
const getItemUIStatus = (
  item: any, 
  originalSponsors: string[], 
  pendingChange?: ItemChanges
): UIStatus => {
  // 1. Se tem mudanças pendentes não salvas → RASCUNHO
  if (pendingChange?.isDirty) {
    return 'RASCUNHO';
  }
  
  // 2. Se status indica que já foi enviado para Arte ou produção → ENVIADO
  const sentStatuses = [
    'awaiting_submission', // Já foi enviado para Arte
    'awaiting_sponsor_approval', 
    'sponsor_approved',
    'awaiting_creator_review',
    'ready_for_production',
    'released',
    'in_production',
    'produced',
    'delivered'
  ];
  if (sentStatuses.includes(item.status)) {
    return 'ENVIADO';
  }
  
  // 3. Items com status 'requested' e com patrocinadores salvos → PRONTO (para enviar)
  const canSendStatuses = ['requested', 'awaiting_linking'];
  if (canSendStatuses.includes(item.status)) {
    const hasSponsors = originalSponsors.length > 0;
    const hasSkipApproval = item.skipApproval === true;
    if (hasSponsors || hasSkipApproval) {
      return 'PRONTO';
    }
    return 'PENDENTE';
  }
  
  // 4. Caso contrário → PENDENTE
  return 'PENDENTE';
};

// Cores para cada status UI
const UI_STATUS_CONFIG = {
  RASCUNHO: {
    label: 'Rascunho',
    icon: Circle,
    badgeClass: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20',
    chipClass: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
  },
  PRONTO: {
    label: 'Pronto',
    icon: CheckCircle2,
    badgeClass: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
    chipClass: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
  },
  ENVIADO: {
    label: 'Enviado',
    icon: Send,
    badgeClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
    chipClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
  },
  PENDENTE: {
    label: 'Pendente',
    icon: AlertCircle,
    badgeClass: 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20',
    chipClass: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
  }
};

// Função helper para converter hex para rgba
const hexToRgba = (hex: string, alpha: number = 1): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(59, 130, 246, ${alpha})`; // Fallback azul
  return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
};

// Função para obter cor do patrocinador a partir dos dados
const getSponsorColorStyle = (sponsor: any) => {
  const color = sponsor?.color || "#3b82f6";
  return {
    backgroundColor: hexToRgba(color, 0.1),
    borderColor: hexToRgba(color, 0.3),
    color: color,
  };
};

// Função para obter cor do patrocinador pelo ID
const getSponsorColorById = (sponsorId: string, allSponsors: any[]) => {
  const sponsor = allSponsors.find(s => s.id === sponsorId);
  return getSponsorColorStyle(sponsor);
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
  
  // Estado para controlar qual aba está ativa
  const [activeTab, setActiveTab] = useState<"vincular" | "enviar">("vincular");
  
  // Estado para controlar items expandidos
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  
  // Estado para seleção de items para ENVIAR (separado da seleção para aplicar patrocinadores)
  const [selectedForSending, setSelectedForSending] = useState<Set<string>>(new Set());

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

  // Mostrar apenas items de eventos futuros com status que permitem vinculação de patrocinadores
  // Exclui: draft (ainda não confirmado pela Solicitação)
  const visibleItems = useMemo(() => {
    const today = startOfDay(new Date());
    const allowedStatuses = [
      'requested',
      'awaiting_linking', 
      'awaiting_submission',
      'awaiting_sponsor_approval',
      'sponsor_approved',
      'awaiting_creator_review',
      'ready_for_production',
      'released',
      'in_production',
      'produced',
      'delivered'
    ];
    
    return items.filter(item => {
      // Filtro 1: Evento futuro
      const event = rawEvents.find(e => e.id === item.eventId);
      if (!event) return false;
      const eventStartDate = startOfDay(new Date(event.startDate));
      const isFutureEvent = isAfter(eventStartDate, today) || eventStartDate.getTime() === today.getTime();
      
      // Filtro 2: Status permitido (exclui draft)
      const hasValidStatus = allowedStatuses.includes(item.status);
      
      return isFutureEvent && hasValidStatus;
    });
  }, [items, rawEvents]);
  
  // Determinar quais items são editáveis (baseado no status UI)
  const getItemEditability = (item: any) => {
    const originalSponsors = originalSponsorsMap[item.id] || [];
    const pendingChange = pendingChanges[item.id];
    const uiStatus = getItemUIStatus(item, originalSponsors, pendingChange);
    // Items enviados não podem ser editados
    return uiStatus !== 'ENVIADO';
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

  // Estado para armazenar sponsors originais (do banco de dados) - DEVE VIR ANTES DE filterItems
  const [originalSponsorsMap, setOriginalSponsorsMap] = useState<Record<string, string[]>>({});

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

      // Filtro por patrocinador (usar dados SALVOS, não locais)
      if (sponsorFilter !== "all") {
        const savedSponsors = originalSponsorsMap[item.id] || [];
        if (!savedSponsors.includes(sponsorFilter)) {
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
  }, [itemsByEvent, events, searchQuery, eventFilter, sponsorFilter, itemFilter, originalSponsorsMap]);

  // ===== FONTE ÚNICA DE VERDADE: Computar estados UI de todos os items =====
  const itemUIStates = useMemo(() => {
    const states: Record<string, UIStatus> = {};
    visibleItems.forEach(item => {
      const originalSponsors = originalSponsorsMap[item.id] || [];
      const pendingChange = pendingChanges[item.id];
      states[item.id] = getItemUIStatus(item, originalSponsors, pendingChange);
    });
    return states;
  }, [visibleItems, originalSponsorsMap, pendingChanges]);

  // ===== Contadores globais baseados nos estados UI =====
  const statusCounts = useMemo(() => {
    const counts = {
      RASCUNHO: 0,
      PRONTO: 0,
      ENVIADO: 0,
      PENDENTE: 0
    };
    Object.values(itemUIStates).forEach(status => {
      counts[status]++;
    });
    return counts;
  }, [itemUIStates]);

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

        // Sincronizar patrocinadores e skipApproval (backend atualiza status automaticamente)
        await apiRequest("POST", `/api/items/${itemId}/sponsors/sync`, {
          sponsorIds: changes.sponsorIds,
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

      // Invalidar cache E forçar refetch para pegar novo status
      await queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      await queryClient.refetchQueries({ queryKey: ["/api/items"], type: 'active' });
      
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
        title: "✅ Vinculação salva!",
        description: `${validItemIds.length} item${validItemIds.length !== 1 ? 's' : ''} pronto${validItemIds.length !== 1 ? 's' : ''} para enviar. Clique em "Enviar para Arte" quando estiver tudo certo.`,
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

  // Mutation para enviar items para Arte
  const sendToArteMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      const res = await apiRequest("POST", "/api/items/send-to-arte", { itemIds });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setSelectedItemIds(new Set());
      setSelectedForSending(new Set()); // Limpar seleção para envio
      
      if (data.errors && data.errors.length > 0) {
        toast({
          title: `${data.sent} item${data.sent !== 1 ? 's' : ''} enviado${data.sent !== 1 ? 's' : ''} para Arte`,
          description: `Alguns itens tiveram erros: ${data.errors.join(', ')}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "✅ Enviado para Arte!",
          description: `${data.sent} item${data.sent !== 1 ? 's' : ''} enviado${data.sent !== 1 ? 's' : ''} para criação do thumb de aprovação.`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar para Arte",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handler para enviar items selecionados para Arte
  const handleSendSelectedToArte = () => {
    if (selectedForSending.size === 0) {
      toast({
        title: "Nenhum item selecionado",
        description: "Selecione os itens que deseja enviar para Arte.",
        variant: "destructive",
      });
      return;
    }
    
    sendToArteMutation.mutate(Array.from(selectedForSending));
  };
  
  // Funções para seleção de items para envio
  const toggleSendingSelection = (itemId: string) => {
    setSelectedForSending(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };
  
  const selectAllReadyItems = () => {
    const readyItemIds = visibleItems.filter(item => {
      const uiStatus = itemUIStates[item.id];
      return uiStatus === 'PRONTO';
    }).map(item => item.id);
    setSelectedForSending(new Set(readyItemIds));
  };
  
  const clearSendingSelection = () => {
    setSelectedForSending(new Set());
  };

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
    
    if (bulkSelectedSponsors.length === 0 && !bulkSkipApproval) {
      toast({
        title: "⚠️ Nenhum patrocinador selecionado",
        description: "Selecione pelo menos um patrocinador ou marque 'Pular aprovação'",
        variant: "destructive",
      });
      return;
    }
    
    // Aplicar patrocinadores a TODOS os items selecionados
    // Adiciona aos patrocinadores existentes (não substitui)
    const itemsToUpdate: string[] = [];
    
    allSelectedItems.forEach(itemId => {
      const currentSponsors = itemSponsorsMap[itemId] || originalSponsorsMap[itemId] || [];
      const item = items.find(i => i.id === itemId);
      const originalSkipApproval = item?.skipApproval || false;
      
      // Combinar patrocinadores existentes com novos (sem duplicatas)
      const combinedSponsors = Array.from(new Set([...currentSponsors, ...bulkSelectedSponsors]));
      
      const hasChanges = 
        !areSponsorsEqual(combinedSponsors, originalSponsorsMap[itemId] || []) ||
        bulkSkipApproval !== originalSkipApproval;
      
      if (hasChanges) {
        setPendingChanges(prev => ({
          ...prev,
          [itemId]: {
            sponsorIds: combinedSponsors,
            skipApproval: bulkSkipApproval,
            isDirty: true
          }
        }));
        
        setItemSponsorsMap(prev => ({
          ...prev,
          [itemId]: combinedSponsors
        }));
        
        itemsToUpdate.push(itemId);
      }
    });

    // Limpar seleção e fechar modal
    setSelectedItemIds(new Set());
    setBulkApplyDialogOpen(false);
    setBulkSelectedSponsors([]);
    setBulkSkipApproval(false);
    
    if (itemsToUpdate.length === 0) {
      toast({
        title: "ℹ️ Nenhuma alteração",
        description: "Os patrocinadores selecionados já estavam vinculados",
      });
      return;
    }
    
    // Salvar automaticamente após aplicar
    saveLinkingMutation.mutate(itemsToUpdate);
  };

  // Calcular progresso
  const getItemStatus = (item: any) => {
    // Sempre usar dados SALVOS no banco (originalSponsorsMap), não estado local
    const savedSponsors = originalSponsorsMap[item.id] || [];
    const savedSkipApproval = item.skipApproval || false;
    
    // Status baseado APENAS em dados salvos no banco
    // Mudanças pendentes (não salvas) são tratadas separadamente pelo badge "Pronto"
    if (savedSkipApproval) return 'skip';
    if (savedSponsors.length > 0) return 'linked';
    
    return 'pending';
  };

  const calculateProgress = (eventItems: any[]) => {
    const completed = eventItems.filter(item => {
      const status = getItemStatus(item);
      return status === 'linked' || status === 'skip';
    }).length;
    return { completed, total: eventItems.length };
  };

  // Separar items em duas categorias para as abas
  const itemsParaVincular = useMemo(() => {
    // Items que ainda precisam ter patrocinadores vinculados
    // Inclui: PENDENTE (sem sponsors) e RASCUNHO (mudanças não salvas)
    return visibleItems.filter(item => {
      const uiStatus = itemUIStates[item.id];
      return uiStatus === 'PENDENTE' || uiStatus === 'RASCUNHO';
    });
  }, [visibleItems, itemUIStates]);

  const itemsParaEnviar = useMemo(() => {
    // Items que já têm sponsors salvos e estão prontos para enviar
    // Status: PRONTO (saved, awaiting submission)
    return visibleItems.filter(item => {
      const uiStatus = itemUIStates[item.id];
      return uiStatus === 'PRONTO';
    });
  }, [visibleItems, itemUIStates]);

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


  // Calcular progresso
  const totalItems = visibleItems.length;
  const completedItems = visibleItems.filter(item => itemUIStates[item.id] === 'ENVIADO').length;
  const progressPercent = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

  const toggleItemExpansion = (itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      {/* Header com Progresso */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold">Vincular Patrocinadores</h1>
          
          {/* Badges de Status */}
          <div className="flex flex-wrap gap-2">
            {statusCounts.PENDENTE > 0 && (
              <Badge variant="secondary" className={UI_STATUS_CONFIG.PENDENTE.chipClass}>
                {statusCounts.PENDENTE} Pendente
              </Badge>
            )}
            {statusCounts.RASCUNHO > 0 && (
              <Badge variant="secondary" className={UI_STATUS_CONFIG.RASCUNHO.chipClass}>
                {statusCounts.RASCUNHO} Não Salvo
              </Badge>
            )}
            {statusCounts.PRONTO > 0 && (
              <Badge variant="secondary" className={UI_STATUS_CONFIG.PRONTO.chipClass}>
                {statusCounts.PRONTO} Pronto
              </Badge>
            )}
            {statusCounts.ENVIADO > 0 && (
              <Badge variant="secondary" className={UI_STATUS_CONFIG.ENVIADO.chipClass}>
                {statusCounts.ENVIADO} Enviado
              </Badge>
            )}
          </div>
        </div>
        
        {/* Barra de Progresso */}
        <Card className="mb-3">
          <CardContent className="p-3">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Progress value={progressPercent} className="h-2" />
              </div>
              <div className="text-xs text-muted-foreground whitespace-nowrap">
                <span className="font-medium">{completedItems}</span> de <span className="font-medium">{totalItems}</span> enviados
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Painel de Ações - Duas Etapas Separadas */}
        <div className="space-y-3">
          {/* ETAPA 1: Salvar Vinculações */}
          {statusCounts.RASCUNHO > 0 && (
            <Card className="border-yellow-300 dark:border-yellow-700 bg-yellow-50/50 dark:bg-yellow-950/20">
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-yellow-500 flex items-center justify-center text-white font-bold text-sm">1</div>
                    <div>
                      <div className="font-medium text-sm text-yellow-800 dark:text-yellow-200">Salvar Vinculações</div>
                      <div className="text-xs text-yellow-600 dark:text-yellow-400">
                        {statusCounts.RASCUNHO} item{statusCounts.RASCUNHO !== 1 ? 's' : ''} com patrocinadores selecionados aguardando salvar
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-yellow-600 hover:bg-yellow-700 text-white"
                    onClick={() => {
                      const ids = visibleItems.filter(i => itemUIStates[i.id] === 'RASCUNHO').map(i => i.id);
                      saveLinkingMutation.mutate(ids);
                    }}
                    disabled={saveLinkingMutation.isPending}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Salvar Tudo ({statusCounts.RASCUNHO})
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* ETAPA 2: Enviar para Arte */}
          {statusCounts.PRONTO > 0 && (
            <Card className="border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20">
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">2</div>
                    <div>
                      <div className="font-medium text-sm text-blue-800 dark:text-blue-200">Enviar para Arte</div>
                      <div className="text-xs text-blue-600 dark:text-blue-400">
                        {selectedForSending.size > 0 
                          ? `${selectedForSending.size} de ${statusCounts.PRONTO} selecionado${selectedForSending.size !== 1 ? 's' : ''}`
                          : `${statusCounts.PRONTO} item${statusCounts.PRONTO !== 1 ? 's' : ''} pronto${statusCounts.PRONTO !== 1 ? 's' : ''} - marque o checkbox ou clique "Enviar"`
                        }
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedForSending.size > 0 ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-blue-600"
                          onClick={clearSendingSelection}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                          onClick={handleSendSelectedToArte}
                          disabled={sendToArteMutation.isPending}
                        >
                          <Send className="h-4 w-4 mr-2" />
                          Enviar Selecionados ({selectedForSending.size})
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-blue-300 text-blue-600 hover:bg-blue-50"
                        onClick={() => {
                          const readyItemIds = visibleItems.filter(item => itemUIStates[item.id] === 'PRONTO').map(item => item.id);
                          sendToArteMutation.mutate(readyItemIds);
                        }}
                        disabled={sendToArteMutation.isPending}
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Enviar Todos ({statusCounts.PRONTO})
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Acordeões por Evento */}
      <Accordion type="multiple" className="space-y-3">
        {filteredEventEntries.map(([eventId, eventItems]) => {
          const event = events.find(e => e.id === eventId);
          if (!event) return null;

          const eventSponsors = getEventSponsors(eventId);
          const eventCompleted = eventItems.every(item => itemUIStates[item.id] === 'ENVIADO');
          const eventProgress = eventItems.filter(item => itemUIStates[item.id] === 'ENVIADO').length;
          
          return (
            <AccordionItem key={eventId} value={eventId} className="border-0">
              <AccordionTrigger className="hidden">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div className="text-left">
                      <div className="font-semibold text-sm">{event.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(event.startDate), "dd 'de' MMMM", { locale: ptBR })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {eventCompleted ? (
                      <Badge variant="secondary" className={UI_STATUS_CONFIG.ENVIADO.chipClass}>
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Concluído
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {eventProgress}/{eventItems.length}
                      </span>
                    )}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-0">
                <div className="space-y-2">
                  {eventItems.map((item) => {
                    const uiStatus = itemUIStates[item.id] || 'PENDENTE';
                    const config = UI_STATUS_CONFIG[uiStatus];
                    const Icon = config.icon;
                    const linkedSponsors = itemSponsorsMap[item.id] || [];
                    const isExpanded = expandedItems.has(item.id);
                    const isLocked = uiStatus === 'ENVIADO';
                    
                    return (
                      <Card key={item.id} className={`overflow-hidden ${isLocked ? 'opacity-75' : ''}`}>
                        {/* Linha do Item */}
                        <div className="p-2">
                          <div className="flex items-center justify-between gap-2">
                            {/* Info do Item */}
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <button
                                onClick={() => !isLocked && toggleItemExpansion(item.id)}
                                className={`p-1 rounded transition-colors ${isLocked ? 'cursor-not-allowed' : 'hover:bg-muted'}`}
                                disabled={isLocked}
                              >
                                <ChevronDown 
                                  className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''} ${isLocked ? 'text-muted-foreground' : ''}`}
                                />
                              </button>
                              <span className="text-xs font-mono font-semibold text-primary">{item.displayId}</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{item.type}</div>
                                {item.description && (
                                  <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                                )}
                              </div>
                            </div>
                            
                            {/* Status e Ações */}
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className={`text-xs gap-1 ${config.badgeClass}`}>
                                <Icon className="h-3 w-3" />
                                {config.label}
                              </Badge>
                              
                              {uiStatus === 'RASCUNHO' && (
                                <Button 
                                  size="sm" 
                                  onClick={() => saveLinkingMutation.mutate([item.id])} 
                                  disabled={saveLinkingMutation.isPending}
                                >
                                  <Save className="h-3 w-3 mr-1" />
                                  Salvar
                                </Button>
                              )}
                              {uiStatus === 'PRONTO' && (
                                <Button 
                                  size="sm" 
                                  variant="default"
                                  className="bg-blue-600 hover:bg-blue-700 text-white"
                                  onClick={() => sendToArteMutation.mutate([item.id])} 
                                  disabled={sendToArteMutation.isPending}
                                >
                                  <Send className="h-3 w-3 mr-1" />
                                  Enviar
                                </Button>
                              )}
                            </div>
                          </div>
                          
                          {/* Área Expandida - Patrocinadores */}
                          {isExpanded && isLocked && (
                            <div className="mt-2 pt-2 border-t">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Item já enviado - não pode ser editado</span>
                              </div>
                            </div>
                          )}
                          {isExpanded && !isLocked && (
                            <div className="mt-2 pt-2 border-t">
                              <div className="text-xs font-medium mb-1">Selecione os patrocinadores:</div>
                              {eventSponsors.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">Nenhum patrocinador cadastrado neste evento</p>
                              ) : (
                                <div className="grid grid-cols-2 gap-1">
                                  {eventSponsors.map(sponsor => (
                                    <div key={sponsor.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50">
                                      <Checkbox
                                        id={`sponsor-${item.id}-${sponsor.id}`}
                                        checked={linkedSponsors.includes(sponsor.id)}
                                        onCheckedChange={(checked) => {
                                          const newSponsors = checked
                                            ? [...linkedSponsors, sponsor.id]
                                            : linkedSponsors.filter(id => id !== sponsor.id);
                                          
                                          const originalSponsors = originalSponsorsMap[item.id] || [];
                                          const hasChanges = !areSponsorsEqual(newSponsors, originalSponsors);
                                          
                                          if (hasChanges) {
                                            setPendingChanges(prev => ({
                                              ...prev,
                                              [item.id]: {
                                                sponsorIds: newSponsors,
                                                skipApproval: item.skipApproval || false,
                                                isDirty: true
                                              }
                                            }));
                                          } else {
                                            setPendingChanges(prev => {
                                              const newChanges = { ...prev };
                                              delete newChanges[item.id];
                                              return newChanges;
                                            });
                                          }
                                          
                                          setItemSponsorsMap(prev => ({
                                            ...prev,
                                            [item.id]: newSponsors
                                          }));
                                        }}
                                        data-testid={`checkbox-sponsor-${item.id}-${sponsor.id}`}
                                      />
                                      <label 
                                        htmlFor={`sponsor-${item.id}-${sponsor.id}`}
                                        className="text-sm cursor-pointer flex-1"
                                      >
                                        {sponsor.name}
                                      </label>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Dialogs e Modals */}
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
                  {[...events].sort((a, b) => a.name.localeCompare(b.name)).map(event => (
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
                  {[...sponsors].sort((a, b) => a.name.localeCompare(b.name)).map(sponsor => (
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

      {/* Toolbar de Seleção em Massa - Flutuante/Sticky */}
      {selectedItemIds.size > 0 && (
        <div className="sticky top-0 z-50 mb-6">
          <Card className="border-primary shadow-lg bg-gradient-to-r from-primary/10 to-primary/5 border-2 border-primary/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {/* Badge de Contagem */}
                  <div className="flex items-center gap-3 bg-background px-4 py-2 rounded-lg shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center animate-pulse">
                        <span className="text-base font-bold text-primary-foreground">{selectedItemIds.size}</span>
                      </div>
                      <div>
                        <div className="font-semibold text-sm">
                          {selectedItemIds.size} item{selectedItemIds.size !== 1 ? 's' : ''} selecionado{selectedItemIds.size !== 1 ? 's' : ''}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Pronto para aplicar em lote
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Botão Limpar */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedItemIds(new Set())}
                    data-testid="button-clear-selection"
                    className="gap-2"
                  >
                    <X className="h-4 w-4" />
                    Limpar
                  </Button>
                </div>
                
                {/* Botão de Ação Principal */}
                <Button
                  onClick={handleOpenBulkApplyDialog}
                  className="gap-2 shadow-md"
                  size="default"
                  data-testid="button-apply-bulk-sponsors"
                >
                  <Users className="h-4 w-4" />
                  Aplicar Patrocinadores
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
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

                {/* Patrocinadores do Evento - Badges Compactos com Cores Personalizadas */}
                {eventSponsors.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {eventSponsors.map(sponsor => {
                      const colorStyle = getSponsorColorStyle(sponsor);
                      return (
                        <Badge 
                          key={sponsor.id} 
                          variant="secondary" 
                          className="text-xs gap-1 border"
                          style={colorStyle}
                        >
                          <Building2 className="h-3 w-3" />
                          {sponsor.name}
                        </Badge>
                      );
                    })}
                  </div>
                )}

              </CardHeader>

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
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Link2 className="h-3 w-3" />
                            Vincular Patrocinadores
                          </div>
                        </th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Sem Aprov.</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                          <div className="flex items-center justify-center gap-1">
                            <Send className="h-3 w-3" />
                            Enviar
                          </div>
                        </th>
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
                            className={`border-b hover:bg-muted/30 transition-all cursor-pointer ${
                              pendingChanges[item.id]?.isDirty
                                ? 'bg-yellow-50/70 dark:bg-yellow-900/20 border-l-4 border-l-yellow-500'
                                : itemStatus === 'linked' || itemStatus === 'skip'
                                ? 'bg-green-50/50 dark:bg-green-900/10'
                                : ''
                            } ${!isEditable ? 'opacity-60' : ''}`}
                            onClick={() => setSelectedItemForDetails(item)}
                            data-testid={`item-row-${item.id}`}
                          >
                            <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedItemIds.has(item.id)}
                                onCheckedChange={() => isEditable && toggleItemSelection(item.id)}
                                disabled={!isEditable}
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
                                <span className="font-medium text-sm text-foreground">{item.type}</span>
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
                                    const colorStyle = getSponsorColorStyle(sponsor);
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
                                        <label 
                                          className={`text-xs font-medium ${!isEditable ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                                          style={{ color: colorStyle.color }}
                                        >
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
                            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-2">
                                {/* Badge única baseada em itemUIStates */}
                                {(() => {
                                  const uiStatus = itemUIStates[item.id] || 'PENDENTE';
                                  const config = UI_STATUS_CONFIG[uiStatus];
                                  const Icon = config.icon;
                                  
                                  return (
                                    <>
                                      <Badge variant="secondary" className={`text-xs gap-1 ${config.badgeClass}`} data-testid={`badge-status-${item.id}`}>
                                        <Icon className="h-3 w-3" />
                                        {config.label}
                                      </Badge>
                                      
                                      {/* Botão de ação baseado no estado */}
                                      {uiStatus === 'RASCUNHO' && isEditable && (
                                        <Button
                                          size="sm"
                                          variant="default"
                                          className="gap-1 text-xs"
                                          onClick={() => saveLinkingMutation.mutate([item.id])}
                                          disabled={saveLinkingMutation.isPending}
                                          data-testid={`button-save-item-${item.id}`}
                                        >
                                          <Save className="h-3 w-3" />
                                          Salvar
                                        </Button>
                                      )}
                                      {uiStatus === 'PRONTO' && isEditable && (
                                        <div className="flex items-center gap-2">
                                          <Checkbox
                                            checked={selectedForSending.has(item.id)}
                                            onCheckedChange={() => toggleSendingSelection(item.id)}
                                            data-testid={`checkbox-send-item-${item.id}`}
                                            className="border-blue-500 data-[state=checked]:bg-blue-600"
                                          />
                                          {!selectedForSending.has(item.id) && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="gap-1 text-xs border-blue-300 text-blue-600 hover:bg-blue-50"
                                              onClick={() => sendToArteMutation.mutate([item.id])}
                                              disabled={sendToArteMutation.isPending}
                                              data-testid={`button-send-item-${item.id}`}
                                            >
                                              <Send className="h-3 w-3" />
                                              Enviar
                                            </Button>
                                          )}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
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
                    const colorStyle = getSponsorColorStyle(sponsor);
                    const isSelected = bulkSelectedSponsors.includes(sponsor.id);
                    return (
                      <div 
                        key={sponsor.id} 
                        className={`flex items-center space-x-3 p-3 border-2 rounded-lg transition-all cursor-pointer hover-elevate ${
                          isSelected ? 'border-primary' : 'border-border bg-background'
                        }`}
                        style={isSelected ? { backgroundColor: colorStyle.backgroundColor } : undefined}
                        onClick={() => {
                          if (isSelected) {
                            setBulkSelectedSponsors(bulkSelectedSponsors.filter(id => id !== sponsor.id));
                          } else {
                            setBulkSelectedSponsors([...bulkSelectedSponsors, sponsor.id]);
                          }
                        }}
                      >
                        <Checkbox
                          id={`bulk-sponsor-${sponsor.id}`}
                          checked={isSelected}
                          onCheckedChange={() => {}}
                          data-testid={`checkbox-bulk-sponsor-${sponsor.id}`}
                        />
                        <div 
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: sponsor.color || "#3b82f6" }}
                        />
                        <label
                          htmlFor={`bulk-sponsor-${sponsor.id}`}
                          className="text-sm font-medium leading-tight cursor-pointer flex-1"
                          style={{ color: colorStyle.color }}
                        >
                          {sponsor.name}
                          {sponsor.company && (
                            <span className="text-muted-foreground ml-1">({sponsor.company})</span>
                          )}
                        </label>
                        {isSelected && (
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
      <ItemDetailsDialog
        item={selectedItemForDetails}
        auditLogs={auditLogs}
        open={!!selectedItemForDetails}
        onOpenChange={(open) => !open && setSelectedItemForDetails(null)}
      />
    </div>
  );
}
