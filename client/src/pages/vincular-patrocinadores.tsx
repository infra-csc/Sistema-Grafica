import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo } from "react";
import { Package, Check, Calendar, Truck, Link2, AlertCircle, CheckCircle2, X, Building2, Plus, Search, Filter, Users, FileText, ClipboardList, History, CircleDot, Circle, Save, Send, ArrowRight, ChevronDown, Info, Lock, ShieldCheck } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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

interface SendConfirmModal {
  items: any[];
  pendingByItem: Record<string, Set<string>>;
}

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

// Cores para cada status UI — Titanium Design System
const UI_STATUS_CONFIG = {
  RASCUNHO: {
    label: 'Preparado',
    icon: Circle,
    badgeStyle: { backgroundColor: '#ffedd5', color: '#c2410c' },
    chipClass: 'bg-orange-100 text-orange-700',
    rowBg: '#fffbf5',
  },
  PRONTO: {
    label: 'Pronto',
    icon: CheckCircle2,
    badgeStyle: { backgroundColor: '#dcfce7', color: '#166534' },
    chipClass: 'bg-green-100 text-green-800',
    rowBg: '#f0fdf4',
  },
  ENVIADO: {
    label: 'Enviado',
    icon: Check,
    badgeStyle: { backgroundColor: '#e0f2fe', color: '#0369a1' },
    chipClass: 'bg-sky-100 text-sky-800',
    rowBg: 'transparent',
  },
  PENDENTE: {
    label: 'Pendente',
    icon: Circle,
    badgeStyle: { backgroundColor: '#f5f5f4', color: '#57534e' },
    chipClass: 'bg-stone-100 text-stone-600',
    rowBg: 'transparent',
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

  // Vista principal: por-item (existente) | por-patrocinador (nova)
  const [viewMode, setViewMode] = useState<"por-item" | "por-patrocinador">("por-item");

  // Seleção em lote na aba "Por Patrocinador"
  const [sponsorBulkSelected, setSponsorBulkSelected] = useState<Set<string>>(new Set());
  const [optimisticSentIds, setOptimisticSentIds] = useState<Set<string>>(new Set());

  const [sendConfirmModal, setSendConfirmModal] = useState<SendConfirmModal | null>(null);

  // Estado para controlar items expandidos
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Estado para expandir a lista de patrocinadores por item (quando há muitos)
  const [expandedSponsorCells, setExpandedSponsorCells] = useState<Set<string>>(new Set());
  const toggleSponsorExpand = (itemId: string) => {
    setExpandedSponsorCells(prev => {
      const n = new Set(prev);
      n.has(itemId) ? n.delete(itemId) : n.add(itemId);
      return n;
    });
  };
  const SPONSOR_PILL_LIMIT = 4;

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
  
  // Toggle "Sem Patrocinador" por item individual
  const toggleItemSkipApproval = (item: any) => {
    const originalSponsors = originalSponsorsMap[item.id] || [];
    const originalSkipApproval = item.skipApproval || false;
    const currentSkipApproval = pendingChanges[item.id]?.skipApproval ?? originalSkipApproval;
    const newSkipApproval = !currentSkipApproval;

    const newSponsors = newSkipApproval ? [] : originalSponsors;
    const hasChanges =
      !areSponsorsEqual(newSponsors, originalSponsors) ||
      newSkipApproval !== originalSkipApproval;

    setPendingChanges(prev => {
      if (!hasChanges) {
        const next = { ...prev };
        delete next[item.id];
        return next;
      }
      return {
        ...prev,
        [item.id]: { sponsorIds: newSponsors, skipApproval: newSkipApproval, isDirty: true },
      };
    });
    setItemSponsorsMap(prev => ({ ...prev, [item.id]: newSponsors }));
  };

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

  // Auto-deselect items que saíram do estado PENDENTE (ex: após vincular patrocinador individualmente)
  useEffect(() => {
    setSelectedItemIds(prev => {
      const next = new Set<string>();
      prev.forEach(id => {
        if ((itemUIStates[id] || 'PENDENTE') === 'PENDENTE') {
          next.add(id);
        }
      });
      return next.size === prev.size ? prev : next;
    });
  }, [itemUIStates]);

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
          const sponsorIds = itemSponsors.map((is: any) => is.id).filter(Boolean);
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
      // Atualização otimista — reflete imediatamente sem esperar o servidor
      setItemSponsorsMap(prev => ({ ...prev, [itemId]: sponsorIds }));
      setOriginalSponsorsMap(prev => ({ ...prev, [itemId]: sponsorIds }));
    },
    onSuccess: (_, { itemId }) => {
      // Só invalida em background — não bloqueia a UI
      queryClient.invalidateQueries({ queryKey: ["/api/items", itemId, "sponsors"] });
      toast({ title: "Atualizado!", description: "Patrocinadores vinculados com sucesso" });
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
        await apiRequest("POST", `/api/items/${itemId}/sponsors/sync`, {
          sponsorIds: changes.sponsorIds,
          skipApproval: changes.skipApproval
        });
      }
      
      return validItemIds;
    },
    onMutate: (itemIdsToSave: string[]) => {
      // Atualização otimista: reflete o novo estado nos mapas antes do servidor responder
      const snapshot = { itemSponsorsMap: { ...itemSponsorsMap }, originalSponsorsMap: { ...originalSponsorsMap } };
      
      itemIdsToSave.forEach(itemId => {
        const changes = pendingChanges[itemId];
        if (changes) {
          setItemSponsorsMap(prev => ({ ...prev, [itemId]: changes.sponsorIds }));
          setOriginalSponsorsMap(prev => ({ ...prev, [itemId]: changes.sponsorIds }));
        }
      });

      return snapshot; // Usado no onError para reverter
    },
    onSuccess: (validItemIds) => {
      // Limpar pendingChanges dos itens salvos
      setPendingChanges(prev => {
        const newChanges = { ...prev };
        validItemIds.forEach(id => { delete newChanges[id]; });
        return newChanges;
      });

      // Invalida em background — não bloqueia a UI
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });

      toast({
        title: "Vinculação salva!",
        description: `${validItemIds.length} item${validItemIds.length !== 1 ? 's' : ''} pronto${validItemIds.length !== 1 ? 's' : ''} para enviar.`,
      });
    },
    onError: (error: Error, _, snapshot: any) => {
      // Reverter estado otimista em caso de erro
      if (snapshot) {
        setItemSponsorsMap(snapshot.itemSponsorsMap);
        setOriginalSponsorsMap(snapshot.originalSponsorsMap);
      }
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
    onMutate: (itemIds: string[]) => {
      // Atualização otimista: marca visualmente como ENVIADO antes da resposta do servidor
      setOptimisticSentIds(prev => new Set([...prev, ...itemIds]));
    },
    onSuccess: (data) => {
      // Invalida em background — não bloqueia
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setSelectedItemIds(new Set());
      setSelectedForSending(new Set());
      setOptimisticSentIds(new Set()); // Limpa otimistas — dados reais já chegaram
      setSendConfirmModal(null);
      
      if (data.errors && data.errors.length > 0) {
        toast({
          title: `${data.sent} item${data.sent !== 1 ? 's' : ''} enviado${data.sent !== 1 ? 's' : ''} para Arte`,
          description: `Alguns itens tiveram erros: ${data.errors.join(', ')}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Enviado para Arte!",
          description: `${data.sent} item${data.sent !== 1 ? 's' : ''} enviado${data.sent !== 1 ? 's' : ''} com sucesso.`,
        });
      }
    },
    onError: (error: Error, itemIds: string[]) => {
      // Reverter estado otimista
      setOptimisticSentIds(prev => {
        const next = new Set(prev);
        itemIds.forEach(id => next.delete(id));
        return next;
      });
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
        title: "Nenhum patrocinador selecionado",
        description: "Selecione pelo menos um patrocinador ou marque 'Pular aprovação'",
        variant: "destructive",
      });
      return;
    }
    
    // Aplicar patrocinadores apenas a itens NÃO isentos (skipApproval=false)
    // a menos que bulkSkipApproval seja true (nesse caso, aplica a todos)
    const itemsToUpdate: string[] = [];
    const skippedItems: string[] = [];
    
    allSelectedItems.forEach(itemId => {
      const currentSponsors = itemSponsorsMap[itemId] || originalSponsorsMap[itemId] || [];
      const item = items.find(i => i.id === itemId);
      const originalSkipApproval = item?.skipApproval || false;
      
      // Pular itens isentos quando não está aplicando skipApproval
      if (originalSkipApproval && !bulkSkipApproval) {
        skippedItems.push(itemId);
        return;
      }
      
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
        title: "Nenhuma alteração",
        description: skippedItems.length > 0
          ? `${skippedItems.length} item${skippedItems.length !== 1 ? 's' : ''} isento${skippedItems.length !== 1 ? 's' : ''} ignorado${skippedItems.length !== 1 ? 's' : ''}. Patrocinadores já estavam vinculados nos demais.`
          : "Os patrocinadores selecionados já estavam vinculados",
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
    return visibleItems.filter(item => {
      const uiStatus = itemUIStates[item.id];
      return uiStatus === 'PRONTO';
    });
  }, [visibleItems, itemUIStates]);

  // ── Dados agrupados para aba "Por Patrocinador" ──────────────────────────
  // Estrutura: [{ event, sponsors: [{ sponsor, items: any[] }] }]
  const sponsorGroupedData = useMemo(() => {
    if (sponsors.length === 0) return [];

    // Aplicar filtros de evento/tipo/busca
    const filterFn = (item: any, eventName: string) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!item.type.toLowerCase().includes(q) &&
            !item.description?.toLowerCase().includes(q) &&
            !eventName.toLowerCase().includes(q)) return false;
      }
      if (itemFilter !== "all" && item.type !== itemFilter) return false;
      return true;
    };

    return Object.entries(itemsByEvent)
      .filter(([eventId]) => {
        if (eventFilter !== "all" && eventId !== eventFilter) return false;
        const event = events.find(e => e.id === eventId);
        return !!event;
      })
      .map(([eventId, eventItems]) => {
        const event = events.find(e => e.id === eventId)!;
        const eventSponsorList = getEventSponsors(eventId);

        // Filtrar por patrocinador selecionado no filtro
        const sponsorsToShow = sponsorFilter !== "all"
          ? eventSponsorList.filter(s => s.id === sponsorFilter)
          : eventSponsorList;

        const sponsorGroups = sponsorsToShow.map(sponsor => {
          const sponsorItems = eventItems.filter(item => {
            const linked = originalSponsorsMap[item.id] || [];
            return linked.includes(sponsor.id) && filterFn(item, event.name);
          });

          // Items PENDENTES deste patrocinador (sem ele vinculado)
          const pendingItems = eventItems.filter(item => {
            const linked = originalSponsorsMap[item.id] || [];
            return !linked.includes(sponsor.id) && filterFn(item, event.name);
          });

          return { sponsor, items: sponsorItems, pendingItems };
        });

        // Totais
        const totalItems = eventItems.filter(i => filterFn(i, event.name)).length;
        const linkedCount = eventItems.filter(i => {
          const linked = originalSponsorsMap[i.id] || [];
          return linked.length > 0 || i.skipApproval;
        }).length;

        return { event, sponsorGroups, totalItems, linkedCount };
      })
      .filter(g => g.sponsorGroups.some(sg => sg.items.length > 0 || sg.pendingItems.length > 0) || g.totalItems > 0);
  }, [itemsByEvent, events, sponsors, originalSponsorsMap, searchQuery, itemFilter, eventFilter, sponsorFilter, sponsorBulkSelected]);

  // Contagem de patrocinadores totalmente vinculados (todos os itens do evento têm esse patrocinador)
  const sponsorLinkStats = useMemo(() => {
    let total = 0, fullyLinked = 0;
    events.forEach(event => {
      const eventSponsorList = getEventSponsors(event.id);
      eventSponsorList.forEach(sponsor => {
        total++;
        const eventItemIds = (itemsByEvent[event.id] || []).map(i => i.id);
        if (eventItemIds.length > 0 && eventItemIds.every(id => (originalSponsorsMap[id] || []).includes(sponsor.id))) {
          fullyLinked++;
        }
      });
    });
    return { total, fullyLinked };
  }, [events, itemsByEvent, originalSponsorsMap, sponsors]);

  // Toggle seleção em lote por patrocinador (aba "Por Patrocinador")
  // Chave composta "itemId::sponsorId" para isolar seleção por grupo
  const sponsorKey = (itemId: string, sponsorId: string) => `${itemId}::${sponsorId}`;

  const toggleSponsorBulkItem = (itemId: string, sponsorId: string) => {
    const key = sponsorKey(itemId, sponsorId);
    setSponsorBulkSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleSponsorGroup = (pendingItemIds: string[], sponsorId: string) => {
    setSponsorBulkSelected(prev => {
      const next = new Set(prev);
      const keys = pendingItemIds.map(id => sponsorKey(id, sponsorId));
      const allSelected = keys.every(k => next.has(k));
      if (allSelected) keys.forEach(k => next.delete(k));
      else keys.forEach(k => next.add(k));
      return next;
    });
  };

  // Extrai item IDs únicos a partir das chaves compostas selecionadas
  const selectedSponsorItemIds = () =>
    Array.from(new Set(Array.from(sponsorBulkSelected).map(k => k.split('::')[0])));

  // Agrupa as chaves compostas por itemId → lista de sponsorIds selecionados
  const groupSelectedBySponsor = () => {
    const map: Record<string, string[]> = {};
    Array.from(sponsorBulkSelected).forEach(key => {
      const [itemId, sponsorId] = key.split('::');
      if (!map[itemId]) map[itemId] = [];
      map[itemId].push(sponsorId);
    });
    return map;
  };

  // Handler bulk da aba Por Patrocinador:
  // 1. Para cada item, mescla patrocinadores existentes + recém-selecionados
  // 2. Sincroniza no banco
  // 3. Envia para Arte
  const handleSponsorBulkSendToArte = async () => {
    const grouped = groupSelectedBySponsor();
    const itemIds = Object.keys(grouped);
    if (itemIds.length === 0) return;

    try {
      // Sincronizar sponsors de cada item que tem novos patrocinadores selecionados
      const itemsToSync = itemIds.filter(itemId => {
        const existing = originalSponsorsMap[itemId] || [];
        const newOnes = grouped[itemId] || [];
        return newOnes.some(id => !existing.includes(id));
      });

      for (const itemId of itemsToSync) {
        const existing = originalSponsorsMap[itemId] || [];
        const merged = Array.from(new Set([...existing, ...(grouped[itemId] || [])]));
        await apiRequest("POST", `/api/items/${itemId}/sponsors/sync`, {
          sponsorIds: merged,
          skipApproval: false,
        });
        // Atualizar estado local imediatamente
        setOriginalSponsorsMap(prev => ({ ...prev, [itemId]: merged }));
        setItemSponsorsMap(prev => ({ ...prev, [itemId]: merged }));
      }

      // Abrir modal de confirmação em vez de enviar direto
      const itemsToSend = items.filter((i: any) => itemIds.includes(i.id));
      const pendingByItem: Record<string, Set<string>> = {};
      itemIds.forEach((id: string) => { pendingByItem[id] = new Set(); });
      setSendConfirmModal({ items: itemsToSend, pendingByItem });
    } catch (err: any) {
      toast({
        title: "Erro ao vincular patrocinadores",
        description: err?.message || "Tente novamente",
        variant: "destructive",
      });
    }

    setSponsorBulkSelected(new Set());
  };

  // ===== Modal de Confirmação de Envio =====

  // Abre o modal para o botão "Enviar" individual (item já vinculado)
  const openSendModalForItem = (item: any, preSelectedSponsorId?: string) => {
    const pending: Set<string> = new Set();
    if (preSelectedSponsorId) pending.add(preSelectedSponsorId);
    setSendConfirmModal({ items: [item], pendingByItem: { [item.id]: pending } });
  };

  // Abre o modal para o bulk "Vincular e Enviar"
  const openSendModalForBulk = () => {
    const grouped = groupSelectedBySponsor();
    const itemIds = Object.keys(grouped);
    if (itemIds.length === 0) return;
    const items = visibleItems.filter(i => itemIds.includes(i.id));
    const pendingByItem: Record<string, Set<string>> = {};
    items.forEach(item => {
      const existing = originalSponsorsMap[item.id] || [];
      // Only NEW sponsors (not yet linked)
      const newOnes = (grouped[item.id] || []).filter(id => !existing.includes(id));
      pendingByItem[item.id] = new Set(newOnes);
    });
    setSendConfirmModal({ items, pendingByItem });
  };

  // Alterna sponsor no modal (na seção "outros patrocinadores")
  const toggleModalSponsor = (itemId: string, sponsorId: string) => {
    setSendConfirmModal(prev => {
      if (!prev) return prev;
      const next = new Set(prev.pendingByItem[itemId] || []);
      next.has(sponsorId) ? next.delete(sponsorId) : next.add(sponsorId);
      return { ...prev, pendingByItem: { ...prev.pendingByItem, [itemId]: next } };
    });
  };

  // Confirma e executa o envio com os patrocinadores finais do modal
  const handleModalConfirmSend = async () => {
    if (!sendConfirmModal) return;
    const { items, pendingByItem } = sendConfirmModal;
    setSendConfirmModal(null);

    try {
      for (const item of items) {
        const existing = originalSponsorsMap[item.id] || [];
        const newOnes = Array.from(pendingByItem[item.id] || []);
        const merged = Array.from(new Set([...existing, ...newOnes]));
        if (newOnes.some(id => !existing.includes(id))) {
          await apiRequest("POST", `/api/items/${item.id}/sponsors/sync`, {
            sponsorIds: merged,
            skipApproval: false,
          });
          setOriginalSponsorsMap(prev => ({ ...prev, [item.id]: merged }));
          setItemSponsorsMap(prev => ({ ...prev, [item.id]: merged }));
        }
      }
      const itemIds = items.map(i => i.id);
      setOptimisticSentIds(prev => new Set([...prev, ...itemIds]));
      sendToArteMutation.mutate(itemIds);
    } catch (err: any) {
      toast({
        title: "Erro ao enviar",
        description: err?.message || "Tente novamente",
        variant: "destructive",
      });
    }
    setSponsorBulkSelected(new Set());
  };

  // Vincular patrocinador a item individual (aba Por Patrocinador)
  const linkSponsorToItem = (itemId: string, sponsorId: string) => {
    const current = originalSponsorsMap[itemId] || [];
    if (current.includes(sponsorId)) return;
    const newSponsors = [...current, sponsorId];
    setPendingChanges(prev => ({
      ...prev,
      [itemId]: { sponsorIds: newSponsors, skipApproval: false, isDirty: true },
    }));
    setItemSponsorsMap(prev => ({ ...prev, [itemId]: newSponsors }));
    saveLinkingMutation.mutate([itemId]);
  };

  // Desvincular patrocinador de item individual (aba Por Patrocinador)
  const unlinkSponsorFromItem = (itemId: string, sponsorId: string) => {
    const current = originalSponsorsMap[itemId] || [];
    if (!current.includes(sponsorId)) return;
    const newSponsors = current.filter(id => id !== sponsorId);
    // Atualizar estado local imediatamente
    setItemSponsorsMap(prev => ({ ...prev, [itemId]: newSponsors }));
    setOriginalSponsorsMap(prev => ({ ...prev, [itemId]: newSponsors }));
    // Persistir no servidor
    apiRequest("POST", `/api/items/${itemId}/sponsors/sync`, {
      sponsorIds: newSponsors,
      skipApproval: false,
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    }).catch(() => {
      // reverter em caso de erro
      setItemSponsorsMap(prev => ({ ...prev, [itemId]: current }));
      setOriginalSponsorsMap(prev => ({ ...prev, [itemId]: current }));
      toast({ title: "Erro ao desvincular", variant: "destructive" });
    });
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
    <div className="container mx-auto p-4 max-w-6xl pb-24">
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 42, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.03em', lineHeight: 1, color: '#1a1c1c', marginBottom: 12 }}>
            Vincular Patrocinadores
          </h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <span style={{ padding: '2px 10px', borderRadius: 9999, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', backgroundColor: '#e8e8e7', color: '#78716c', textTransform: 'uppercase' }}>PENDENTE</span>
            <span style={{ padding: '2px 10px', borderRadius: 9999, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', backgroundColor: '#ffedd5', color: '#c2410c', textTransform: 'uppercase' }}>RASCUNHO</span>
            <span style={{ padding: '2px 10px', borderRadius: 9999, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', backgroundColor: '#dcfce7', color: '#166534', textTransform: 'uppercase' }}>PRONTO</span>
            <span style={{ padding: '2px 10px', borderRadius: 9999, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', backgroundColor: '#1c1917', color: '#ffffff', textTransform: 'uppercase', opacity: 0.55 }}>ENVIADO</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button
            style={{ padding: '10px 20px', backgroundColor: '#e8e8e7', color: '#1c1917', fontWeight: 700, fontSize: 13, borderRadius: 6, border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#d8d8d7')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#e8e8e7')}
          >
            Exportar PDF
          </button>
          <button
            style={{ padding: '10px 20px', backgroundColor: '#f97316', color: '#ffffff', fontWeight: 700, fontSize: 13, borderRadius: 6, border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
            onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
          >
            Finalizar Lote
          </button>
        </div>
      </div>

      {/* ── Progress Grid 3-col ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {/* Col 1-2: barra de progresso */}
        <div className="md:col-span-2 flex flex-col justify-between" style={{ backgroundColor: '#f3f4f3', borderRadius: 10, padding: '20px 24px' }}>
          <div className="flex justify-between items-end mb-4">
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#78716c' }}>Progresso de Envio</span>
            <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 22, fontWeight: 900, color: '#1a1c1c', letterSpacing: '-0.03em' }}>
              {completedItems} <span style={{ color: '#a8a29e' }}>de</span> {totalItems}{' '}
              <span style={{ fontSize: 10, fontWeight: 600, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>enviados</span>
            </span>
          </div>
          <div style={{ width: '100%', height: 8, backgroundColor: '#e7e5e4', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', backgroundColor: '#f97316', borderRadius: 4, width: `${progressPercent}%`, transition: 'width 0.5s ease' }} />
          </div>
        </div>

        {/* Col 3: alertas de ação */}
        <div className="space-y-3">
          <div style={{ backgroundColor: '#f3f4f3', borderLeft: '4px solid #f97316', padding: '14px 16px', borderRadius: '0 8px 8px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Ação Pendente</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#1a1c1c' }}>{statusCounts.RASCUNHO} {statusCounts.RASCUNHO !== 1 ? 'itens' : 'item'} em RASCUNHO</p>
            </div>
            {statusCounts.RASCUNHO > 0 && (
              <button
                onClick={() => { const ids = visibleItems.filter(i => itemUIStates[i.id] === 'RASCUNHO').map(i => i.id); saveLinkingMutation.mutate(ids); }}
                disabled={saveLinkingMutation.isPending}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f97316', display: 'flex', alignItems: 'center' }}
              >
                <Save style={{ width: 16, height: 16 }} />
              </button>
            )}
          </div>
          <div style={{ backgroundColor: '#f3f4f3', borderLeft: '4px solid #166534', padding: '14px 16px', borderRadius: '0 8px 8px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Pronto para Envio</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#1a1c1c' }}>{statusCounts.PRONTO} {statusCounts.PRONTO !== 1 ? 'itens' : 'item'} aguardando</p>
            </div>
            {statusCounts.PRONTO > 0 && (
              <button
                onClick={() => {
                  const prontoItems = visibleItems.filter(i => itemUIStates[i.id] === 'PRONTO');
                  if (prontoItems.length === 0) return;
                  const pendingByItem: Record<string, Set<string>> = {};
                  prontoItems.forEach(i => { pendingByItem[i.id] = new Set(); });
                  setSendConfirmModal({ items: prontoItems, pendingByItem });
                }}
                disabled={sendToArteMutation.isPending}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', display: 'flex', alignItems: 'center' }}
              >
                <Send style={{ width: 16, height: 16 }} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Tab Switcher (underline) ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e7e5e4', marginBottom: 20 }}>
        {[
          { id: "por-item",         label: "Por Item",         icon: <ClipboardList style={{ width: 14, height: 14 }} /> },
          { id: "por-patrocinador", label: "Por Patrocinador", icon: <Building2 style={{ width: 14, height: 14 }} /> },
        ].map(tab => {
          const active = viewMode === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id as "por-item" | "por-patrocinador")}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 28px', border: 'none', background: 'none',
                cursor: 'pointer', fontSize: 13,
                fontWeight: active ? 800 : 700,
                letterSpacing: '-0.02em', textTransform: 'uppercase',
                color: active ? '#1c1917' : '#a8a29e',
                borderBottom: active ? '2px solid #1c1917' : '2px solid transparent',
                marginBottom: -1,
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = '#1c1917'; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = '#a8a29e'; }}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

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
              <label className="text-xs text-muted-foreground mb-1.5 block">Peça</label>
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

      {/* Toolbar de Seleção em Massa — Floating Bottom */}
      {selectedItemIds.size > 0 && (
        <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 640, padding: '0 24px', zIndex: 50 }}>
          <div style={{ backgroundColor: '#1c1917', color: '#ffffff', padding: '14px 20px', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 16px 48px rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, backgroundColor: '#f97316', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, fontFamily: 'Space Grotesk, sans-serif', color: '#ffffff', flexShrink: 0 }}>
                {selectedItemIds.size}
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.01em', color: '#ffffff', marginBottom: 1 }}>Itens Selecionados</p>
                <p style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.45)' }}>Lote de produção ativa</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => setSelectedItemIds(new Set())}
                data-testid="button-clear-selection"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.04em' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ffffff')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}
              >
                Limpar
              </button>
              <button
                onClick={handleOpenBulkApplyDialog}
                data-testid="button-apply-bulk-sponsors"
                style={{ backgroundColor: '#f97316', color: '#ffffff', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '-0.01em', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
              >
                <Users style={{ width: 14, height: 14 }} />
                Aplicar Patrocinadores
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── VIEW: POR ITEM (existente) ── */}
      {viewMode === 'por-item' && (
      <div className="space-y-6">
        {filteredEventEntries.map(([eventId, eventItems]) => {
          const event = events.find(e => e.id === eventId);
          const eventSponsors = getEventSponsors(eventId);
          
          // Usar a mesma função de filtro para garantir consistência
          // Ordenar por tipo para que o agrupador funcione corretamente
          const displayedItems = filterItems(eventItems, event?.name)
            .slice()
            .sort((a, b) => a.type.localeCompare(b.type, 'pt-BR'));

          const progress = calculateProgress(displayedItems);

          if (!event) return null;

          return (
            <section key={eventId} className="space-y-0">

              {/* ── Cabeçalho escuro Titanium ── */}
              <header style={{ backgroundColor: '#1c1917', padding: '18px 20px', borderRadius: '10px 10px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#ffffff', fontSize: 17, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {event.name}
                  </h2>
                  <span style={{ backgroundColor: progress.completed === progress.total && progress.total > 0 ? '#f97316' : '#3d3936', color: '#ffffff', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 900, whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: '0.03em' }}>
                    {progress.completed}/{progress.total} CONCLUÍDO
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: 18, fontSize: 11, fontWeight: 500, color: '#a8a29e' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Calendar style={{ width: 13, height: 13 }} />
                      <span>{format(new Date(event.startDate), "dd MMM yyyy", { locale: ptBR }).toUpperCase()}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Truck style={{ width: 13, height: 13 }} />
                      <span>{format(new Date(event.truckDepartureDate), "dd MMM yyyy", { locale: ptBR }).toUpperCase()}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleOpenSponsorDialog(event)}
                    data-testid={`button-manage-event-sponsors-${event.id}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', backgroundColor: 'rgba(255,255,255,0.1)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.2)', fontSize: 11, fontWeight: 600 }}>
                    <Building2 style={{ width: 12, height: 12 }} />
                    {eventSponsors.length === 0 ? 'Adicionar Pat.' : `${eventSponsors.length} Pat.`}
                  </button>
                </div>
              </header>

              {/* Tabela de Items */}
              <div style={{ backgroundColor: '#ffffff', borderRadius: '0 0 10px 10px', overflow: 'hidden', border: '1px solid #e7e5e4', borderTop: 'none' }}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ backgroundColor: '#fafaf9', borderBottom: '1px solid #e7e5e4' }}>
                        <th className="px-3 py-2 text-center w-[50px]">
                          <Checkbox
                            checked={displayedItems.filter(item => (itemUIStates[item.id] || 'PENDENTE') === 'PENDENTE').length > 0 && displayedItems.filter(item => (itemUIStates[item.id] || 'PENDENTE') === 'PENDENTE').every(item => selectedItemIds.has(item.id))}
                            onCheckedChange={() => toggleAllItemsInEvent(displayedItems.filter(item => (itemUIStates[item.id] || 'PENDENTE') === 'PENDENTE'))}
                            disabled={displayedItems.filter(item => (itemUIStates[item.id] || 'PENDENTE') === 'PENDENTE').length === 0}
                            data-testid={`checkbox-select-all-${event.id}`}
                          />
                        </th>
                        <th className="px-3 py-4 text-left" style={{ fontSize: '10px', fontWeight: 900, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>ID</th>
                        <th className="px-3 py-4 text-left" style={{ fontSize: '10px', fontWeight: 900, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Peça / Especificação</th>
                        <th className="px-3 py-4 text-left" style={{ fontSize: '10px', fontWeight: 900, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Detalhes</th>
                        <th className="px-3 py-4 text-left" style={{ fontSize: '10px', fontWeight: 900, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          <div className="flex items-center gap-1">
                            <Link2 className="h-3 w-3" />
                            Vínculos Ativos
                          </div>
                        </th>
                        <th className="px-3 py-4 text-right pr-6" style={{ fontSize: '10px', fontWeight: 900, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          Status / Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedItems.map((item, itemIndex) => {
                        const itemStatus = getItemStatus(item);
                        const linkedSponsors = itemSponsorsMap[item.id] || [];
                        const currentSkipApproval = pendingChanges[item.id]?.skipApproval ?? (item.skipApproval || false);
                        const isEditable = getItemEditability(item);
                        const uiStatus = itemUIStates[item.id] || 'PENDENTE';
                        const rowConfig = UI_STATUS_CONFIG[uiStatus];
                        const isRascunho = uiStatus === 'RASCUNHO';
                        const prevItem = itemIndex > 0 ? displayedItems[itemIndex - 1] : null;
                        const showTypeGrouper = !prevItem || prevItem.type !== item.type;

                        return (
                          <>
                          {/* ── Agrupador de Tipo ── */}
                          {showTypeGrouper && (
                            <tr key={`type-${item.type}-${itemIndex}`}>
                              <td colSpan={6} style={{ padding: 0 }}>
                                <div style={{ backgroundColor: 'rgba(249,115,22,0.06)', borderLeft: '4px solid #f97316', padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <span style={{ fontSize: 10, fontWeight: 900, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                    {item.type} — {displayedItems.filter(i => i.type === item.type).length} {displayedItems.filter(i => i.type === item.type).length !== 1 ? 'itens' : 'item'}
                                  </span>
                                  <ChevronDown style={{ width: 14, height: 14, color: '#a8a29e' }} />
                                </div>
                              </td>
                            </tr>
                          )}
                          <tr
                            key={item.id}
                            className="cursor-pointer"
                            style={{
                              borderBottom: '1px solid #f0efee',
                              borderLeft: uiStatus === 'RASCUNHO' ? '4px solid #f97316' : uiStatus === 'PRONTO' ? '4px solid #22c55e' : '4px solid transparent',
                              backgroundColor: uiStatus === 'RASCUNHO' ? 'rgba(249,115,22,0.04)' : uiStatus === 'PRONTO' ? 'rgba(134,239,172,0.10)' : '#ffffff',
                              opacity: uiStatus === 'ENVIADO' ? 0.55 : 1,
                              filter: uiStatus === 'ENVIADO' ? 'grayscale(1)' : 'none',
                              transition: 'background-color 0.12s, filter 0.2s, opacity 0.2s',
                            }}
                            onMouseEnter={e => {
                              const el = e.currentTarget as HTMLElement;
                              el.style.filter = 'none';
                              el.style.opacity = '1';
                              el.style.backgroundColor = uiStatus === 'RASCUNHO' ? 'rgba(249,115,22,0.09)' : uiStatus === 'PRONTO' ? 'rgba(134,239,172,0.18)' : '#fafaf9';
                            }}
                            onMouseLeave={e => {
                              const el = e.currentTarget as HTMLElement;
                              el.style.filter = uiStatus === 'ENVIADO' ? 'grayscale(1)' : 'none';
                              el.style.opacity = uiStatus === 'ENVIADO' ? '0.55' : '1';
                              el.style.backgroundColor = uiStatus === 'RASCUNHO' ? 'rgba(249,115,22,0.04)' : uiStatus === 'PRONTO' ? 'rgba(134,239,172,0.10)' : '#ffffff';
                            }}
                            onClick={() => setSelectedItemForDetails(item)}
                            data-testid={`item-row-${item.id}`}
                          >
                            <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedItemIds.has(item.id)}
                                onCheckedChange={() => uiStatus === 'PENDENTE' && toggleItemSelection(item.id)}
                                disabled={uiStatus !== 'PENDENTE'}
                                title={uiStatus === 'PRONTO' ? 'Remova os patrocinadores antes de aplicar em lote' : uiStatus === 'RASCUNHO' ? 'Salve as alterações antes de selecionar' : uiStatus === 'ENVIADO' ? 'Peça já enviada' : undefined}
                                data-testid={`checkbox-item-${item.id}`}
                              />
                            </td>
                            <td className="px-3 py-3">
                              <div className="font-mono whitespace-nowrap" style={{ fontSize: 11, fontWeight: 700, color: '#a8a29e' }} data-testid={`text-display-id-${item.id}`}>
                                {item.displayId}
                              </div>
                            </td>
                            <td className="px-3 py-3" style={{ minWidth: 180 }}>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 700, fontSize: 13, color: '#1a1c1c' }}>{item.type}</span>
                                {item.description && (
                                  <span style={{ fontSize: 11, color: '#78716c', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                                    {item.description}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#1a1c1c' }}>Qty: {String(item.quantity).padStart(2, '0')}</span>
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '-0.02em' }}>
                                  {parseFloat(item.calculatedM2).toFixed(2)} m²
                                </span>
                              </div>
                            </td>
                            {/* ── Coluna: Vínculos Ativos ── */}
                            <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                              {currentSkipApproval ? (
                                /* "Sem Patrocinador" path */
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  {(uiStatus === 'PRONTO' || uiStatus === 'ENVIADO') ? (
                                    <span style={{ padding: '3px 6px', backgroundColor: '#1c1917', color: '#ffffff', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', borderRadius: 3, letterSpacing: '0.04em' }}>
                                      Sem Pat.
                                    </span>
                                  ) : (
                                    <>
                                      <span style={{ padding: '3px 8px', backgroundColor: uiStatus === 'RASCUNHO' ? '#fff7ed' : '#f5f5f4', color: uiStatus === 'RASCUNHO' ? '#c2410c' : '#78716c', fontSize: 10, fontWeight: 600, borderRadius: 4, border: `1px solid ${uiStatus === 'RASCUNHO' ? '#fed7aa' : '#e7e5e4'}` }}>
                                        Sem Patrocinador
                                      </span>
                                      {isEditable && (
                                        <button onClick={() => toggleItemSkipApproval(item)} data-testid={`btn-undo-skip-${item.id}`} style={{ background: 'none', border: 'none', fontSize: 10, color: '#a8a29e', cursor: 'pointer', textDecoration: 'underline' }}>
                                          desfazer
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              ) : (
                                <div>
                                  {eventSponsors.length === 0 ? (
                                    <span style={{ fontSize: 11, color: '#a8a29e', fontStyle: 'italic' }}>Adicione patrocinadores ao evento</span>
                                  ) : (uiStatus === 'PRONTO' || uiStatus === 'ENVIADO') ? (
                                    /* Saved: dark pills com truncamento + × para desvincular (só PRONTO) */
                                    (() => {
                                      const isExpanded = expandedSponsorCells.has(item.id);
                                      const validLinked = linkedSponsors.map(sId => eventSponsors.find(s => s.id === sId)).filter(Boolean) as any[];
                                      const visible = isExpanded ? validLinked : validLinked.slice(0, SPONSOR_PILL_LIMIT);
                                      const overflow = validLinked.length - SPONSOR_PILL_LIMIT;
                                      const canUnlink = uiStatus === 'PRONTO' && isEditable;
                                      return (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                                          {validLinked.length > 0 ? (
                                            <>
                                              {visible.map((sp: any) => (
                                                <span
                                                  key={sp.id}
                                                  style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: canUnlink ? 4 : 0,
                                                    padding: canUnlink ? '3px 4px 3px 6px' : '3px 6px',
                                                    backgroundColor: uiStatus === 'ENVIADO' ? '#e8e8e7' : '#1c1917',
                                                    color: uiStatus === 'ENVIADO' ? '#78716c' : '#ffffff',
                                                    fontSize: 9, fontWeight: 700, textTransform: 'uppercase', borderRadius: 3, letterSpacing: '0.04em',
                                                  }}
                                                >
                                                  {sp.name}
                                                  {canUnlink && (
                                                    <button
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        const newSponsors = linkedSponsors.filter(id => id !== sp.id);
                                                        const originalSponsors = originalSponsorsMap[item.id] || [];
                                                        const origSkip = item.skipApproval || false;
                                                        const curSkip = pendingChanges[item.id]?.skipApproval ?? origSkip;
                                                        const hasChanges = !areSponsorsEqual(newSponsors, originalSponsors) || curSkip !== origSkip;
                                                        setPendingChanges(prev => {
                                                          if (!hasChanges) { const n = { ...prev }; delete n[item.id]; return n; }
                                                          return { ...prev, [item.id]: { sponsorIds: newSponsors, skipApproval: curSkip, isDirty: true } };
                                                        });
                                                        setItemSponsorsMap(prev => ({ ...prev, [item.id]: newSponsors }));
                                                      }}
                                                      title={`Desvincular ${sp.name}`}
                                                      style={{ background: 'none', border: 'none', padding: '1px 2px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.6)', lineHeight: 1 }}
                                                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ffffff'; }}
                                                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.6)'; }}
                                                    >
                                                      <X style={{ width: 9, height: 9 }} />
                                                    </button>
                                                  )}
                                                </span>
                                              ))}
                                              {!isExpanded && overflow > 0 && (
                                                <button onClick={(e) => { e.stopPropagation(); toggleSponsorExpand(item.id); }} style={{ padding: '2px 6px', backgroundColor: '#f0efee', color: '#78716c', fontSize: 9, fontWeight: 700, borderRadius: 3, border: 'none', cursor: 'pointer', letterSpacing: '0.03em' }}>
                                                  +{overflow}
                                                </button>
                                              )}
                                              {isExpanded && validLinked.length > SPONSOR_PILL_LIMIT && (
                                                <button onClick={(e) => { e.stopPropagation(); toggleSponsorExpand(item.id); }} style={{ padding: '2px 6px', backgroundColor: '#f0efee', color: '#78716c', fontSize: 9, fontWeight: 700, borderRadius: 3, border: 'none', cursor: 'pointer', letterSpacing: '0.03em' }}>
                                                  ver menos
                                                </button>
                                              )}
                                            </>
                                          ) : (
                                            <span style={{ fontSize: 11, color: '#a8a29e', fontStyle: 'italic' }}>Nenhum</span>
                                          )}
                                        </div>
                                      );
                                    })()
                                  ) : (
                                    /* Editable: pill-style checkboxes com truncamento */
                                    (() => {
                                      const isExpanded = expandedSponsorCells.has(item.id);
                                      const visibleSponsors = isExpanded ? eventSponsors : eventSponsors.slice(0, SPONSOR_PILL_LIMIT);
                                      const overflow = eventSponsors.length - SPONSOR_PILL_LIMIT;
                                      return (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                                          {visibleSponsors.map(sponsor => {
                                            const isLinked = linkedSponsors.includes(sponsor.id);
                                            return (
                                              <label
                                                key={sponsor.id}
                                                style={{
                                                  display: 'inline-flex', alignItems: 'center', gap: 5,
                                                  padding: '4px 8px',
                                                  backgroundColor: isLinked ? '#fff7ed' : '#ffffff',
                                                  border: `1px solid ${isLinked ? '#f97316' : '#e7e5e4'}`,
                                                  borderRadius: 6, cursor: isEditable ? 'pointer' : 'not-allowed',
                                                  transition: 'border-color 0.12s, background-color 0.12s',
                                                }}
                                              >
                                                <input
                                                  type="checkbox"
                                                  checked={isLinked}
                                                  disabled={!isEditable}
                                                  style={{ width: 11, height: 11, accentColor: '#f97316', cursor: isEditable ? 'pointer' : 'not-allowed' }}
                                                  data-testid={`checkbox-sponsor-${item.id}-${sponsor.id}`}
                                                  onChange={(e) => {
                                                    if (!isEditable) return;
                                                    const checked = e.target.checked;
                                                    const newSponsors = checked
                                                      ? [...linkedSponsors, sponsor.id]
                                                      : linkedSponsors.filter(id => id !== sponsor.id);
                                                    const originalSponsors = originalSponsorsMap[item.id] || [];
                                                    const origSkip = item.skipApproval || false;
                                                    const curSkip = pendingChanges[item.id]?.skipApproval ?? origSkip;
                                                    const hasChanges = !areSponsorsEqual(newSponsors, originalSponsors) || curSkip !== origSkip;
                                                    setPendingChanges(prev => {
                                                      if (!hasChanges) { const n = { ...prev }; delete n[item.id]; return n; }
                                                      return { ...prev, [item.id]: { sponsorIds: newSponsors, skipApproval: curSkip, isDirty: true } };
                                                    });
                                                    setItemSponsorsMap(prev => ({ ...prev, [item.id]: newSponsors }));
                                                  }}
                                                />
                                                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: isLinked ? '#c2410c' : '#78716c', letterSpacing: '0.03em' }}>
                                                  {sponsor.name}
                                                </span>
                                              </label>
                                            );
                                          })}
                                          {/* Overflow button */}
                                          {!isExpanded && overflow > 0 && (
                                            <button
                                              onClick={(e) => { e.stopPropagation(); toggleSponsorExpand(item.id); }}
                                              style={{ padding: '4px 8px', backgroundColor: '#f0efee', color: '#78716c', fontSize: 10, fontWeight: 700, borderRadius: 6, border: '1px solid #e7e5e4', cursor: 'pointer' }}
                                            >
                                              +{overflow} mais
                                            </button>
                                          )}
                                          {isExpanded && eventSponsors.length > SPONSOR_PILL_LIMIT && (
                                            <button
                                              onClick={(e) => { e.stopPropagation(); toggleSponsorExpand(item.id); }}
                                              style={{ padding: '4px 8px', backgroundColor: '#f0efee', color: '#78716c', fontSize: 10, fontWeight: 700, borderRadius: 6, border: '1px solid #e7e5e4', cursor: 'pointer' }}
                                            >
                                              ver menos
                                            </button>
                                          )}
                                          {isEditable && (
                                            <button onClick={(e) => { e.stopPropagation(); toggleItemSkipApproval(item); }} data-testid={`btn-skip-sponsor-${item.id}`} style={{ background: 'none', border: 'none', fontSize: 10, color: '#a8a29e', cursor: 'pointer', textDecoration: 'underline', alignSelf: 'center' }}>
                                              sem pat.
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })()
                                  )}
                                </div>
                              )}
                            </td>

                            {/* ── Coluna: Status / Ações ── */}
                            <td className="px-3 py-3 text-right pr-6" onClick={(e) => e.stopPropagation()}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                                {/* Badge de status */}
                                <span
                                  data-testid={`badge-status-${item.id}`}
                                  style={{
                                    padding: '2px 8px', borderRadius: 9999, fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                                    ...(uiStatus === 'RASCUNHO' ? { backgroundColor: '#ffedd5', color: '#c2410c' }
                                      : uiStatus === 'PRONTO' ? { backgroundColor: '#dcfce7', color: '#166534' }
                                      : uiStatus === 'ENVIADO' ? { backgroundColor: '#1c1917', color: '#ffffff' }
                                      : { backgroundColor: '#e8e8e7', color: '#78716c' }),
                                  }}
                                >
                                  {uiStatus === 'RASCUNHO' ? 'RASCUNHO' : uiStatus === 'PRONTO' ? 'PRONTO' : uiStatus === 'ENVIADO' ? 'ENVIADO' : 'PENDENTE'}
                                </span>
                                {/* Ação */}
                                {uiStatus === 'ENVIADO' && (
                                  <Lock style={{ width: 13, height: 13, color: '#a8a29e' }} />
                                )}
                                {uiStatus === 'RASCUNHO' && isEditable && (
                                  <button
                                    onClick={() => saveLinkingMutation.mutate([item.id])}
                                    disabled={saveLinkingMutation.isPending}
                                    data-testid={`button-save-item-${item.id}`}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a8a29e', display: 'flex', alignItems: 'center' }}
                                    title="Salvar vinculação"
                                  >
                                    <Save style={{ width: 14, height: 14 }} />
                                  </button>
                                )}
                                {uiStatus === 'PRONTO' && isEditable && (
                                  <button
                                    onClick={() => openSendModalForItem(item)}
                                    disabled={sendToArteMutation.isPending}
                                    data-testid={`button-send-item-${item.id}`}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a8a29e', display: 'flex', alignItems: 'center' }}
                                    title="Enviar para Arte"
                                  >
                                    <Send style={{ width: 14, height: 14 }} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          );
        })}
      </div>
      )} {/* fim viewMode === 'por-item' */}

      {/* ── VIEW: POR PATROCINADOR (nova) ── */}
      {viewMode === 'por-patrocinador' && (
        <div className="space-y-6">
          {/* Barra de progresso de patrocinadores */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: 8 }}>
            <div style={{ flex: 1, height: 6, backgroundColor: '#e7e5e4', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', backgroundColor: '#f97316', borderRadius: 3, width: `${sponsorLinkStats.total > 0 ? (sponsorLinkStats.fullyLinked / sponsorLinkStats.total) * 100 : 0}%`, transition: 'width 0.4s' }} />
            </div>
            <span style={{ fontSize: 12, color: '#78716c', whiteSpace: 'nowrap' }}>
              <strong style={{ color: '#1c1917' }}>{sponsorLinkStats.fullyLinked}</strong> de <strong style={{ color: '#1c1917' }}>{sponsorLinkStats.total}</strong> patrocinadores totalmente vinculados
            </span>
          </div>

          {/* Bulk floating bar */}
          {sponsorBulkSelected.size > 0 && (() => {
            const uniqueItemIds = selectedSponsorItemIds();
            const n = uniqueItemIds.length;
            return (
            <div style={{ position: 'sticky', top: 0, zIndex: 50, backgroundColor: '#1c1917', borderRadius: 8, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#ffffff' }}>
                  {n}
                </div>
                <span style={{ color: '#ffffff', fontSize: 13, fontWeight: 500 }}>
                  {n} item{n !== 1 ? 's' : ''} selecionado{n !== 1 ? 's' : ''}
                </span>
                <button onClick={() => setSponsorBulkSelected(new Set())} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer' }}>
                  Limpar
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={openSendModalForBulk}
                  disabled={sendToArteMutation.isPending}
                  style={{ backgroundColor: '#f97316', color: '#ffffff', border: 'none', borderRadius: 8, height: 38, padding: '0 18px', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: sendToArteMutation.isPending ? 0.7 : 1 }}
                >
                  <Send style={{ width: 14, height: 14 }} />
                  {sendToArteMutation.isPending ? 'Enviando...' : `Vincular e Enviar ${n} item${n !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
            );
          })()}

          {/* Agrupamento Evento → Patrocinador → Itens */}
          {sponsorGroupedData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#a8a29e', fontSize: 14 }}>
              Nenhum evento com patrocinadores encontrado
            </div>
          ) : sponsorGroupedData.map(({ event, sponsorGroups, totalItems: evTotal, linkedCount }) => {
            const eventSponsorList = getEventSponsors(event.id);
            return (
              <div key={event.id} style={{ border: '1px solid #e7e5e4', borderRadius: 10, overflow: 'hidden' }}>
                {/* Nível 1 — Header do Evento */}
                <div style={{ backgroundColor: '#1c1917', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#ffffff', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {event.name}
                    </span>
                    <span style={{ backgroundColor: '#f97316', color: '#ffffff', borderRadius: 20, padding: '1px 8px', fontSize: 10, fontWeight: 700 }}>
                      {linkedCount}/{evTotal}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {eventSponsorList.map(s => (
                      <span key={s.id} title={s.name} style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: s.color || '#3b82f6', display: 'inline-block' }} />
                    ))}
                    <span style={{ fontSize: 11, color: '#a8a29e' }}>
                      {eventSponsorList.length} Pat.
                    </span>
                  </div>
                </div>

                {/* Nível 2+3 — Por Patrocinador */}
                {sponsorGroups.length === 0 ? (
                  <div style={{ padding: '20px 16px', textAlign: 'center', color: '#a8a29e', fontSize: 13 }}>
                    Adicione patrocinadores ao evento para vincular
                  </div>
                ) : sponsorGroups.map(({ sponsor, items: linkedItems, pendingItems }) => {
                  const allItems = [...linkedItems, ...pendingItems];
                  const pendingIds = pendingItems.map(i => i.id);
                  const allPendingSelected = pendingIds.length > 0 && pendingIds.every(id => sponsorBulkSelected.has(sponsorKey(id, sponsor.id)));
                  return (
                    <div key={sponsor.id}>
                      {/* Nível 2 — Subgrupo do Patrocinador */}
                      <div style={{ backgroundColor: '#fafaf9', borderBottom: '1px solid #e7e5e4', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Checkbox
                          checked={allPendingSelected}
                          onCheckedChange={() => toggleSponsorGroup(pendingIds, sponsor.id)}
                          disabled={pendingIds.length === 0}
                          data-testid={`checkbox-sponsor-group-${event.id}-${sponsor.id}`}
                        />
                        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: sponsor.color || '#3b82f6', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#1c1917' }}>{sponsor.name}</span>
                        <span style={{
                          backgroundColor: '#ffffff', border: '1px solid #e7e5e4',
                          color: '#78716c', fontSize: 11, borderRadius: 100,
                          padding: '2px 8px', flexShrink: 0,
                        }}>
                          {linkedItems.length}/{allItems.length} itens vinculados
                        </span>
                      </div>

                      {/* Nível 3 — Tabela de itens */}
                      {allItems.length > 0 && (
                        <div style={{ backgroundColor: '#ffffff' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ backgroundColor: '#f9f9f8' }}>
                                {['', 'ID', 'Peça', 'Detalhes', 'Vinculado', 'Ação'].map(col => (
                                  <th key={col} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{col}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {allItems.map(item => {
                                const isLinked = linkedItems.some(i => i.id === item.id);
                                const uiStatus = itemUIStates[item.id] || 'PENDENTE';
                                const isSent = uiStatus === 'ENVIADO' || optimisticSentIds.has(item.id);
                                return (
                                  <tr
                                    key={item.id}
                                    style={{ borderBottom: '1px solid #f4f3f0', cursor: 'pointer' }}
                                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#fafaf9')}
                                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '')}
                                    onClick={() => setSelectedItemForDetails(item)}
                                    data-testid={`sp-item-row-${item.id}`}
                                  >
                                    <td style={{ padding: '10px 12px', width: 40 }} onClick={e => e.stopPropagation()}>
                                      <Checkbox
                                        checked={sponsorBulkSelected.has(sponsorKey(item.id, sponsor.id))}
                                        onCheckedChange={() => toggleSponsorBulkItem(item.id, sponsor.id)}
                                        disabled={isLinked || isSent}
                                        data-testid={`sp-checkbox-${item.id}`}
                                      />
                                    </td>
                                    <td style={{ padding: '10px 12px' }}>
                                      <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#f97316', fontWeight: 600 }}>
                                        {item.displayId}
                                      </span>
                                    </td>
                                    <td style={{ padding: '10px 12px', minWidth: 180 }}>
                                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1c1917' }}>{item.type}</div>
                                      {item.description && (
                                        <div style={{ fontSize: 11, color: '#78716c', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                                          {item.description}
                                        </div>
                                      )}
                                    </td>
                                    <td style={{ padding: '10px 12px' }}>
                                      <span style={{ fontSize: 12, color: '#78716c' }}>
                                        {item.quantity} un · {parseFloat(item.calculatedM2 || 0).toFixed(2)} m²
                                      </span>
                                    </td>
                                    <td style={{ padding: '10px 12px' }}>
                                      {isLinked ? (
                                        <span style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac', color: '#15803d', fontSize: 11, borderRadius: 100, padding: '2px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                          <Check style={{ width: 10, height: 10 }} /> Vinculado
                                        </span>
                                      ) : isSent ? (
                                        <span style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c', fontSize: 11, borderRadius: 100, padding: '2px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Item enviado sem este patrocinador vinculado">
                                          <Send style={{ width: 10, height: 10 }} /> Enviado s/ vínculo
                                        </span>
                                      ) : (
                                        <span style={{ backgroundColor: '#fafaf9', border: '1px solid #e7e5e4', color: '#a8a29e', fontSize: 11, borderRadius: 100, padding: '2px 10px' }}>
                                          Pendente
                                        </span>
                                      )}
                                    </td>
                                    <td style={{ padding: '10px 12px' }} onClick={e => e.stopPropagation()}>
                                      {isSent ? (
                                        <span style={{ fontSize: 13, color: '#15803d', display: 'flex', alignItems: 'center', gap: 4 }}>
                                          <Check style={{ width: 14, height: 14 }} /> Enviado
                                        </span>
                                      ) : isLinked ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <button
                                            onClick={() => openSendModalForItem(item)}
                                            disabled={sendToArteMutation.isPending}
                                            style={{ backgroundColor: '#1c1917', color: '#ffffff', border: 'none', borderRadius: 7, height: 32, padding: '0 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'background-color 0.2s' }}
                                            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = '#f97316')}
                                            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = '#1c1917')}
                                            data-testid={`sp-btn-send-${item.id}`}
                                          >
                                            <ArrowRight style={{ width: 12, height: 12 }} /> Enviar
                                          </button>
                                          <button
                                            onClick={() => unlinkSponsorFromItem(item.id, sponsor.id)}
                                            title="Desvincular este patrocinador"
                                            style={{ backgroundColor: 'transparent', border: '1px solid #e7e5e4', color: '#a8a29e', borderRadius: 7, height: 32, padding: '0 10px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, transition: 'border-color 0.15s, color 0.15s' }}
                                            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#ba1a1a'; b.style.color = '#ba1a1a'; }}
                                            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e7e5e4'; b.style.color = '#a8a29e'; }}
                                            data-testid={`sp-btn-unlink-${item.id}-${sponsor.id}`}
                                          >
                                            <X style={{ width: 12, height: 12 }} /> Desvincular
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => linkSponsorToItem(item.id, sponsor.id)}
                                          disabled={saveLinkingMutation.isPending}
                                          style={{ backgroundColor: '#fafaf9', border: '1px solid #e7e5e4', color: '#78716c', borderRadius: 7, height: 32, padding: '0 14px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'border-color 0.15s, color 0.15s' }}
                                          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#1c1917'; b.style.color = '#1c1917'; }}
                                          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e7e5e4'; b.style.color = '#78716c'; }}
                                          data-testid={`sp-btn-link-${item.id}`}
                                        >
                                          <Plus style={{ width: 12, height: 12 }} /> Vincular
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )} {/* fim viewMode === 'por-patrocinador' */}

      {/* Dialog — Gerenciar Patrocinadores do Evento */}
      <Dialog open={sponsorDialogOpen} onOpenChange={setSponsorDialogOpen}>
        <DialogContent className="sm:max-w-md p-0 gap-0" style={{ backgroundColor: '#fafaf9', borderRadius: 12 }}>
          <div style={{ padding: '24px', borderBottom: '1px solid #eeeeed' }}>
            <DialogTitle style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em', color: '#1a1c1c', lineHeight: 1.2 }}>
              Patrocinadores do Evento
            </DialogTitle>
            {selectedEventForSponsors && (
              <p style={{ fontSize: 11, marginTop: 4, color: '#625d5b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {selectedEventForSponsors.name}
              </p>
            )}
          </div>

          <div style={{ padding: '24px', maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sponsors.length === 0 ? (
              <p style={{ fontSize: 13, textAlign: 'center', padding: '32px 0', color: '#625d5b' }}>
                Nenhum patrocinador cadastrado
              </p>
            ) : sponsors.map((sponsor) => {
              const isSelected = selectedSponsorIds.includes(sponsor.id);
              return (
                <div
                  key={sponsor.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px',
                    backgroundColor: '#ffffff',
                    border: isSelected ? '2px solid #f97316' : '1px solid #eeeeed',
                    borderRadius: 8, cursor: 'pointer',
                    transition: 'border-color 0.15s',
                  }}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedSponsorIds(selectedSponsorIds.filter(id => id !== sponsor.id));
                    } else {
                      setSelectedSponsorIds([...selectedSponsorIds, sponsor.id]);
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: sponsor.color || '#3b82f6', flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1c1c' }}>
                      {sponsor.name}
                      {sponsor.company && (
                        <span style={{ marginLeft: 6, fontWeight: 400, color: '#625d5b', fontSize: 13 }}> ({sponsor.company})</span>
                      )}
                    </span>
                  </div>
                  {isSelected ? (
                    <CheckCircle2 style={{ width: 18, height: 18, color: '#f97316', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid #dadad9', flexShrink: 0 }} />
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '14px 24px', borderTop: '1px solid #eeeeed', backgroundColor: '#f3f4f3', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '0 0 12px 12px' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#625d5b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {selectedSponsorIds.length.toString().padStart(2, '0')} / {sponsors.length.toString().padStart(2, '0')} SELECIONADOS
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setSponsorDialogOpen(false)}
                disabled={manageEventSponsorsMutation.isPending}
                style={{ padding: '8px 16px', background: 'none', border: 'none', fontSize: 11, fontWeight: 700, color: '#625d5b', textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer' }}
              >
                CANCELAR
              </button>
              <button
                onClick={handleSaveEventSponsors}
                disabled={manageEventSponsorsMutation.isPending}
                data-testid="button-save-event-sponsors"
                style={{ padding: '8px 16px', backgroundColor: '#f97316', color: '#ffffff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer' }}
              >
                {manageEventSponsorsMutation.isPending ? "SALVANDO..." : "SALVAR"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog — Aplicar Patrocinadores em Lote */}
      <Dialog open={bulkApplyDialogOpen} onOpenChange={setBulkApplyDialogOpen}>
        <DialogContent className="sm:max-w-md p-0 gap-0" style={{ backgroundColor: '#fafaf9', borderRadius: 12 }}>
          <div style={{ padding: '24px', borderBottom: '1px solid #eeeeed' }}>
            <DialogTitle style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em', color: '#1a1c1c', lineHeight: 1.2 }}>
              Aplicar Patrocinadores em Lote
            </DialogTitle>

            {/* Banner informativo sobre isentos */}
            {(() => {
              const exemptCount = Array.from(selectedItemIds).filter(id => {
                const it = items.find(i => i.id === id);
                return it?.skipApproval === true;
              }).length;
              if (exemptCount === 0 || bulkSkipApproval) return null;
              return (
                <div style={{ marginTop: 12, padding: '10px 14px', backgroundColor: '#fff7ed', borderRadius: 8, display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid rgba(249,115,22,0.15)' }}>
                  <Info style={{ width: 14, height: 14, color: '#f97316', flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 11, lineHeight: 1.5, color: '#783200', fontWeight: 500 }}>
                    {exemptCount} item{exemptCount !== 1 ? 's' : ''} isento{exemptCount !== 1 ? 's' : ''} de contrato não receberá{exemptCount !== 1 ? 'ão' : ''} as marcas selecionadas.
                  </p>
                </div>
              );
            })()}
          </div>

          <div style={{ padding: '24px', maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Opção: Sem Patrocinador — aparece primeiro */}
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px',
                backgroundColor: '#ffffff',
                border: bulkSkipApproval ? '2px solid #f97316' : '2px dashed #dadad9',
                borderRadius: 8, cursor: 'pointer',
                opacity: bulkSkipApproval ? 1 : 0.7,
                transition: 'all 0.15s',
              }}
              data-testid="bulk-option-sem-patrocinador"
              onClick={() => {
                if (bulkSkipApproval) {
                  setBulkSkipApproval(false);
                } else {
                  setBulkSelectedSponsors([]);
                  setBulkSkipApproval(true);
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <X style={{ width: 16, height: 16, color: '#625d5b', flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1c1c' }}>Sem Patrocinador</span>
              </div>
              {bulkSkipApproval ? (
                <CheckCircle2 style={{ width: 18, height: 18, color: '#f97316', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid #dadad9', flexShrink: 0 }} />
              )}
            </div>

            {/* Lista de patrocinadores */}
            {sponsors.length === 0 ? (
              <p style={{ fontSize: 13, textAlign: 'center', padding: '24px 0', color: '#625d5b' }}>
                Nenhum patrocinador cadastrado
              </p>
            ) : sponsors.map((sponsor) => {
              const isSelected = bulkSelectedSponsors.includes(sponsor.id);
              return (
                <div
                  key={sponsor.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px',
                    backgroundColor: '#ffffff',
                    border: isSelected ? '2px solid #f97316' : '1px solid #eeeeed',
                    borderRadius: 8, cursor: 'pointer',
                    transition: 'border-color 0.15s',
                  }}
                  data-testid={`checkbox-bulk-sponsor-${sponsor.id}`}
                  onClick={() => {
                    if (isSelected) {
                      setBulkSelectedSponsors(bulkSelectedSponsors.filter(id => id !== sponsor.id));
                    } else {
                      setBulkSkipApproval(false);
                      setBulkSelectedSponsors([...bulkSelectedSponsors, sponsor.id]);
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: sponsor.color || '#3b82f6', flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1c1c' }}>
                      {sponsor.name}
                      {sponsor.company && (
                        <span style={{ marginLeft: 6, fontWeight: 400, color: '#625d5b', fontSize: 13 }}> ({sponsor.company})</span>
                      )}
                    </span>
                  </div>
                  {isSelected ? (
                    <CheckCircle2 style={{ width: 18, height: 18, color: '#f97316', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid #dadad9', flexShrink: 0 }} />
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '14px 24px', borderTop: '1px solid #eeeeed', backgroundColor: '#f3f4f3', display: 'flex', justifyContent: 'flex-end', gap: 8, borderRadius: '0 0 12px 12px' }}>
            <button
              onClick={() => setBulkApplyDialogOpen(false)}
              style={{ padding: '8px 20px', background: 'none', border: 'none', fontSize: 11, fontWeight: 700, color: '#625d5b', textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer' }}
            >
              DESCARTAR
            </button>
            <button
              onClick={handleApplyBulkSponsors}
              data-testid="button-confirm-bulk-apply"
              style={{ padding: '8px 16px', backgroundColor: '#f97316', color: '#ffffff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer' }}
            >
              APLICAR EM LOTE
            </button>
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

      {/* ===== Modal de Confirmação de Envio ===== */}
      <Dialog open={!!sendConfirmModal} onOpenChange={(open) => !open && setSendConfirmModal(null)}>
        <DialogContent className="p-0 gap-0" style={{ maxWidth: 560, borderRadius: 12, overflow: 'hidden' }}>
          <DialogTitle className="sr-only">Confirmar Envio para Arte</DialogTitle>

          {/* Header — centrado com ícone grande */}
          <div style={{ padding: '32px 32px 28px', borderBottom: '1px solid #eeeeed', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <ShieldCheck style={{ width: 32, height: 32, color: '#f97316' }} />
            </div>
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: '#1a1c1c', lineHeight: 1.2 }}>
              Confirmar Envio para Arte
            </div>
            <p style={{ fontSize: 13, color: '#625d5b', marginTop: 8, maxWidth: 340, lineHeight: 1.6 }}>
              Revise os itens e seus respectivos vínculos antes de enviar para aprovação do departamento criativo.
            </p>
          </div>

          {/* Corpo — lista de itens */}
          <ScrollArea style={{ maxHeight: 400 }}>
            <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 28 }}>
              {sendConfirmModal?.items.map((item, idx) => {
                const confirmed = (originalSponsorsMap[item.id] || []);
                const pending = sendConfirmModal.pendingByItem[item.id] || new Set<string>();
                const allSponsorIds = (sponsors as any[]).map((s: any) => s.id);
                const otherSponsorIds = allSponsorIds.filter((sid: string) => !confirmed.includes(sid));

                return (
                  <div key={item.id}>
                    {idx > 0 && <div style={{ height: 1, backgroundColor: '#eeeeed', marginBottom: 28, marginTop: -14 }} />}

                    {/* Seção: Já vinculados */}
                    {confirmed.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                          <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#8c7164', whiteSpace: 'nowrap' }}>
                            Já vinculados
                          </span>
                          <div style={{ height: 1, flex: 1, backgroundColor: '#eeeeed' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {confirmed.map((sid: string) => {
                            const sp = (sponsors as any[]).find((s: any) => s.id === sid);
                            if (!sp) return null;
                            return (
                              <div key={sid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: '#f3f4f3', borderRadius: 6 }}>
                                <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#f97316' }}>{item.displayId}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1c1c' }}>{sp.name}</span>
                                  <span style={{ padding: '2px 6px', backgroundColor: '#dcfce7', color: '#15803d', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', borderRadius: 4, border: '1px solid #bbf7d0', letterSpacing: '0.05em' }}>
                                    Vinculado
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Seção: Selecionar / Adicionar mais */}
                    {otherSponsorIds.length > 0 && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                          <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#f97316', whiteSpace: 'nowrap' }}>
                            {confirmed.length > 0 ? 'Adicionar mais patrocinadores' : 'Selecionar patrocinadores'}
                          </span>
                          <div style={{ height: 1, flex: 1, backgroundColor: 'rgba(249,115,22,0.15)' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {otherSponsorIds.map((sid: string) => {
                            const sp = (sponsors as any[]).find((s: any) => s.id === sid);
                            if (!sp) return null;
                            const isChecked = pending.has(sid);
                            return (
                              <div
                                key={sid}
                                style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  padding: '12px 14px',
                                  border: `2px dashed ${isChecked ? 'rgba(249,115,22,0.4)' : 'rgba(249,115,22,0.2)'}`,
                                  backgroundColor: isChecked ? 'rgba(249,115,22,0.05)' : 'rgba(249,115,22,0.02)',
                                  borderRadius: 6, cursor: 'pointer',
                                  transition: 'all 0.15s',
                                }}
                                onClick={() => toggleModalSponsor(item.id, sid)}
                              >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#f97316' }}>{item.displayId}</span>
                                  <span style={{ fontSize: 12, fontWeight: 500, color: '#625d5b', marginTop: 2 }}>{sp.name}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  {isChecked && (
                                    <span style={{ padding: '2px 7px', backgroundColor: 'rgba(249,115,22,0.12)', color: '#f97316', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', borderRadius: 4, border: '1px solid rgba(249,115,22,0.25)', letterSpacing: '0.05em' }}>
                                      A vincular
                                    </span>
                                  )}
                                  <Plus style={{ width: 16, height: 16, color: '#f97316' }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {confirmed.length === 0 && otherSponsorIds.length === 0 && (
                      <div style={{ fontSize: 12, color: '#a8a29e', fontStyle: 'italic' }}>
                        Nenhum patrocinador disponível
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {/* Footer — botões empilhados em coluna */}
          <div style={{ padding: '24px 32px', borderTop: '1px solid #eeeeed', backgroundColor: '#f3f4f3', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={handleModalConfirmSend}
              disabled={sendToArteMutation.isPending}
              style={{ width: '100%', padding: '16px 24px', backgroundColor: '#1c1917', color: '#ffffff', border: 'none', borderRadius: 8, fontFamily: 'Space Grotesk, sans-serif', fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: sendToArteMutation.isPending ? 0.7 : 1, transition: 'background-color 0.2s' }}
              onMouseEnter={e => { if (!sendToArteMutation.isPending) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#f97316'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#1c1917'; }}
            >
              {sendToArteMutation.isPending ? 'Enviando...' : (
                <>
                  Confirmar e Enviar para Arte{sendConfirmModal && sendConfirmModal.items.length > 1 ? ` (${sendConfirmModal.items.length} peças)` : ''}
                  <Send style={{ width: 16, height: 16 }} />
                </>
              )}
            </button>
            <button
              onClick={() => setSendConfirmModal(null)}
              style={{ width: '100%', padding: '10px 24px', background: 'none', border: 'none', fontSize: 11, fontWeight: 700, color: '#625d5b', textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#1a1c1c'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#625d5b'; }}
            >
              Voltar para rascunhos
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
