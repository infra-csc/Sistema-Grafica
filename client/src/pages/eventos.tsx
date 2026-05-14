import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, Truck, AlertCircle, AlertTriangle, Search, Pencil, Trash2, Package, Filter, Flag, Building2, CheckCircle, ChevronDown, ChevronUp, Clock, HelpCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "wouter";
import { useState, useEffect } from "react";
import type { Sponsor } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

type PriorityLevel = 'baixa' | 'media' | 'alta' | 'urgente' | 'completed' | 'sem_prioridade';

export default function Eventos() {
  const { hasPermission } = useAuth();
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPriorities, setSelectedPriorities] = useState<PriorityLevel[]>([]);
  const [next10DaysFilter, setNext10DaysFilter] = useState(false);
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [formData, setFormData] = useState({
    name: "",
    startDate: "",
    truckDepartureDate: "",
    deadlineListaImagens: -25,
    deadlineEntregaLayouts: -20,
    deadlineAprovacaoLayout: -12,
    deadlineRevisaoLista: -8,
    deadlineProducaoGrafica: -1,
  });
  const [prazosExpanded, setPrazosExpanded] = useState(false);
  const [selectedSponsorIds, setSelectedSponsorIds] = useState<string[]>([]);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [priorityDialogOpen, setPriorityDialogOpen] = useState(false);
  const [selectedEventForPriority, setSelectedEventForPriority] = useState<any>(null);
  const { toast } = useToast();

  const { data: events = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const { data: sponsors = [] } = useQuery<Sponsor[]>({
    queryKey: ["/api/sponsors"],
  });

  const createEventMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      try {
        const response = await apiRequest("POST", "/api/events", data);
        const event = await response.json();
        
        // Vincular todos os patrocinadores em paralelo com Promise.all
        // Nota: Se falhar, o evento já foi criado e não será revertido automaticamente.
        // Para transações atômicas completas, considere implementar lógica server-side.
        if (selectedSponsorIds.length > 0) {
          await Promise.all(
            selectedSponsorIds.map((sponsorId) =>
              apiRequest("POST", `/api/events/${event.id}/sponsors`, { sponsorId })
            )
          );
        }
        
        return event;
      } catch (error) {
        throw new Error("Erro ao criar evento e vincular patrocinadores");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setOpen(false);
      setFormData({ name: "", startDate: "", truckDepartureDate: "", ...defaultDeadlines });
      setSelectedSponsorIds([]);
      setPrazosExpanded(false);
      toast({
        title: "Evento criado",
        description: "O evento foi criado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar evento",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      try {
        // Atualizar evento
        await apiRequest("PATCH", `/api/events/${id}`, data);
        
        // Buscar patrocinadores atuais do evento
        const currentSponsorsRes = await apiRequest("GET", `/api/events/${id}/sponsors`);
        const currentSponsors = await currentSponsorsRes.json();
        const currentSponsorIds = currentSponsors.map((es: any) => es.sponsorId);
        
        // Calcular operações necessárias
        const toRemove = currentSponsorIds.filter((id: string) => !selectedSponsorIds.includes(id));
        const toAdd = selectedSponsorIds.filter((id: string) => !currentSponsorIds.includes(id));
        
        // Executar todas as operações em paralelo com Promise.all
        // Nota: Falha em qualquer operação cancela todas, mas operações bem-sucedidas não são revertidas.
        // Para transações atômicas completas, considere implementar endpoint backend dedicado.
        const operations = [
          ...toRemove.map((sponsorId: string) => 
            apiRequest("DELETE", `/api/events/${id}/sponsors/${sponsorId}`)
          ),
          ...toAdd.map((sponsorId: string) => 
            apiRequest("POST", `/api/events/${id}/sponsors`, { sponsorId })
          ),
        ];
        
        if (operations.length > 0) {
          await Promise.all(operations);
        }
      } catch (error) {
        throw new Error("Erro ao atualizar evento e patrocinadores");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setEditingEvent(null);
      setFormData({ name: "", startDate: "", truckDepartureDate: "", ...defaultDeadlines });
      setSelectedSponsorIds([]);
      setPrazosExpanded(false);
      toast({
        title: "Evento atualizado",
        description: "O evento foi atualizado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar evento",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setDeletingEventId(null);
      toast({
        title: "Evento excluído",
        description: "O evento foi excluído com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir evento",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updatePriorityMutation = useMutation({
    mutationFn: async ({ id, priority }: { id: string; priority: string }) => {
      return await apiRequest("PATCH", `/api/events/${id}/priority`, { priority });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setPriorityDialogOpen(false);
      setSelectedEventForPriority(null);
      toast({
        title: "Prioridade atualizada",
        description: "A prioridade do evento foi atualizada com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar prioridade",
        description: error.message,
        variant: "destructive",
      });
    },
  });


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validação: Saída do caminhão deve ser pelo menos 1 dia ANTES do início do evento
    // Comparar apenas as datas do calendário (YYYY-MM-DD) sem timezone
    const startDateStr = formData.startDate; // "YYYY-MM-DD"
    const truckDateStr = formData.truckDepartureDate.substring(0, 10); // "YYYY-MM-DD"
    
    if (truckDateStr >= startDateStr) {
      toast({
        title: "Data inválida",
        description: "A saída do caminhão deve ser pelo menos 1 dia antes do início do evento",
        variant: "destructive",
      });
      return;
    }
    
    if (editingEvent) {
      updateEventMutation.mutate({ id: editingEvent.id, data: formData });
    } else {
      createEventMutation.mutate(formData);
    }
  };

  const handleEdit = (event: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingEvent(event);
    setFormData({
      name: event.name || "",
      startDate: event.startDate ? new Date(event.startDate).toISOString().slice(0, 10) : "",
      truckDepartureDate: event.truckDepartureDate ? new Date(event.truckDepartureDate).toISOString().slice(0, 16) : "",
      deadlineListaImagens: event.deadlineListaImagens ?? -25,
      deadlineEntregaLayouts: event.deadlineEntregaLayouts ?? -20,
      deadlineAprovacaoLayout: event.deadlineAprovacaoLayout ?? -12,
      deadlineRevisaoLista: event.deadlineRevisaoLista ?? -8,
      deadlineProducaoGrafica: event.deadlineProducaoGrafica ?? -1,
    });
    setOpen(true);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeletingEventId(id);
  };

  const defaultDeadlines = {
    deadlineListaImagens: -25,
    deadlineEntregaLayouts: -20,
    deadlineAprovacaoLayout: -12,
    deadlineRevisaoLista: -8,
    deadlineProducaoGrafica: -1,
  };

  const handleCloseDialog = () => {
    setOpen(false);
    setEditingEvent(null);
    setFormData({ name: "", startDate: "", truckDepartureDate: "", ...defaultDeadlines });
    setSelectedSponsorIds([]);
    setPrazosExpanded(false);
  };

  // Buscar patrocinadores vinculados ao editar evento
  useEffect(() => {
    if (editingEvent) {
      apiRequest("GET", `/api/events/${editingEvent.id}/sponsors`)
        .then((res) => res.json())
        .then((eventSponsors) => {
          const sponsorIds = eventSponsors.map((es: any) => es.sponsorId);
          setSelectedSponsorIds(sponsorIds);
        })
        .catch((error) => {
          console.error("Erro ao buscar patrocinadores:", error);
          setSelectedSponsorIds([]);
        });
    }
  }, [editingEvent]);

  // Função para obter a prioridade do evento (para filtragem)
  const getEventPriority = (event: any): PriorityLevel => {
    if (event.status === 'completed') return 'completed';
    if (!event.priority) return 'sem_prioridade'; // Sem prioridade definida
    return event.priority as PriorityLevel;
  };

  const togglePriority = (priority: PriorityLevel) => {
    setSelectedPriorities(prev => 
      prev.includes(priority) 
        ? prev.filter(p => p !== priority)
        : [...prev, priority]
    );
  };

  const handleSetPriority = (event: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedEventForPriority(event);
    setPriorityDialogOpen(true);
  };

  const handlePrioritySelect = (priority: string) => {
    if (selectedEventForPriority) {
      updatePriorityMutation.mutate({ id: selectedEventForPriority.id, priority });
    }
  };

  const PRIORITY_COLORS: Record<string, string> = {
    urgente:       '#ef4444',
    alta:          '#f59e0b',
    media:         '#a855f7',
    baixa:         '#3b82f6',
    completed:     '#10b981',
    sem_prioridade:'#a8a29e',
  };

  const getPriorityConfig = (priority: string | null | undefined) => {
    const configs = {
      baixa: { 
        label: "Baixa", 
        hex: '#3b82f6',
      },
      media: { 
        label: "Média", 
        hex: '#a855f7',
      },
      alta: { 
        label: "Alta", 
        hex: '#f59e0b',
      },
      urgente: { 
        label: "Urgente", 
        hex: '#ef4444',
      },
      sem_prioridade: { 
        label: "Sem Prioridade", 
        hex: '#a8a29e',
      },
    };
    
    if (!priority) return configs.sem_prioridade;
    return configs[priority as keyof typeof configs] || configs.sem_prioridade;
  };

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

  const filteredEvents = events
    .filter((event) => {
      // Filtro de busca por nome
      const matchesSearch = event.name.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Filtro de prioridade
      const eventPriority = getEventPriority(event);
      const matchesPriority = selectedPriorities.length === 0 || 
        selectedPriorities.includes(eventPriority);
      
      // Filtro de próximos 10 dias
      let matchesNext10Days = true;
      if (next10DaysFilter && event.truckDepartureDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tenDaysFromNow = new Date(today);
        tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);
        const departureDate = new Date(event.truckDepartureDate);
        matchesNext10Days = departureDate >= today && departureDate <= tenDaysFromNow;
      }
      
      // Filtro por mês
      let matchesMonth = true;
      if (monthFilter !== "all" && event.truckDepartureDate) {
        const departureDate = new Date(event.truckDepartureDate);
        const month = departureDate.getMonth() + 1;
        matchesMonth = month.toString() === monthFilter;
      }
      
      return matchesSearch && matchesPriority && matchesNext10Days && matchesMonth;
    })
    .sort((a, b) => {
      const priorityOrder: Record<PriorityLevel, number> = {
        urgente: 0,        // Vermelho - primeiro
        alta: 1,           // Amarelo - segundo
        media: 2,          // Roxo - terceiro
        baixa: 3,          // Azul - quarto
        sem_prioridade: 4, // Cinza - quinto
        completed: 5       // Verde - último
      };

      const priorityA = getEventPriority(a);
      const priorityB = getEventPriority(b);
      
      const orderA = priorityOrder[priorityA];
      const orderB = priorityOrder[priorityB];
      
      // Se têm prioridades diferentes, ordena por prioridade
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      
      // Se têm a mesma prioridade, ordena primeiro por data de início do evento
      const startDateA = new Date(a.startDate);
      const startDateB = new Date(b.startDate);
      
      if (startDateA.getTime() !== startDateB.getTime()) {
        return startDateA.getTime() - startDateB.getTime();
      }
      
      // Se a data de início for igual, ordena por data de saída do caminhão
      const truckDateA = new Date(a.truckDepartureDate);
      const truckDateB = new Date(b.truckDepartureDate);
      return truckDateA.getTime() - truckDateB.getTime();
    });

  const priorityFilterConfig = {
    urgente:       { label: 'Urgente',       hex: '#ef4444', count: events.filter(e => getEventPriority(e) === 'urgente').length },
    alta:          { label: 'Alta',          hex: '#f59e0b', count: events.filter(e => getEventPriority(e) === 'alta').length },
    media:         { label: 'Média',         hex: '#a855f7', count: events.filter(e => getEventPriority(e) === 'media').length },
    baixa:         { label: 'Baixa',         hex: '#3b82f6', count: events.filter(e => getEventPriority(e) === 'baixa').length },
    sem_prioridade:{ label: 'Sem Prioridade',hex: '#a8a29e', count: events.filter(e => getEventPriority(e) === 'sem_prioridade').length },
    completed:     { label: 'Concluído',     hex: '#10b981', count: events.filter(e => getEventPriority(e) === 'completed').length },
  };

  return (
    <div style={{ backgroundColor: '#fafaf9', height: '100%', overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column', gap: '28px' }}>

      {/* ── HEADER ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1
            data-testid="title-eventos"
            style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.03em', fontSize: '40px', fontWeight: '700', color: '#1c1917', margin: 0, lineHeight: 1.1 }}
          >
            Eventos
          </h1>
          <p style={{ color: '#78716c', fontSize: '14px', margin: '6px 0 0 0', fontWeight: '500' }}>
            Gerencie todos os eventos de produção gráfica
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Busca */}
          <div className="relative">
            <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#a8a29e', width: '14px', height: '14px' }} />
            <Input
              placeholder="Buscar eventos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '36px', width: '220px', borderColor: '#e7e5e4', borderRadius: '99px', backgroundColor: '#ffffff', fontSize: '13px' }}
              data-testid="input-search-events"
            />
          </div>

          {/* Botão Novo Evento */}
          <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleCloseDialog(); else setOpen(isOpen); }}>
            <DialogTrigger asChild>
              <Button
                data-testid="button-create-event"
                style={{ backgroundColor: '#f97316', color: '#ffffff', borderRadius: '10px', fontWeight: '700', fontSize: '14px', padding: '0 20px', height: '40px', gap: '8px', boxShadow: '0 4px 14px rgba(249,115,22,0.25)' }}
              >
                <Plus className="h-4 w-4" />
                Novo Evento
              </Button>
            </DialogTrigger>

            {/* ── MODAL CRIAR / EDITAR ── */}
            <DialogContent className="sm:max-w-[512px] p-0 gap-0" style={{ borderRadius: '16px', overflow: 'visible', boxShadow: '0 16px 32px -12px rgba(26,28,28,0.18)', maxHeight: 'calc(100dvh - 48px)', display: 'flex', flexDirection: 'column' }}>
              {/* Cabeçalho */}
              <div style={{ padding: '24px', borderBottom: '1px solid rgba(224,192,177,0.2)', backgroundColor: '#fafaf9', borderRadius: '16px 16px 0 0' }}>
                <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '18px', fontWeight: '700', color: '#1c1917', margin: 0, textTransform: 'uppercase', letterSpacing: '-0.02em', lineHeight: 1 }}>
                  {editingEvent ? "Editar Evento" : "Criar Novo Evento"}
                </DialogTitle>
                <DialogDescription style={{ color: '#78716c', fontSize: '14px', margin: '4px 0 0 0', fontWeight: '400' }}>
                  {editingEvent ? "Atualize as informações do evento." : "Preencha os detalhes do evento."}
                </DialogDescription>
              </div>

              <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', flex: 1, minHeight: 0 }}>

                  {/* Nome */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '10px', fontWeight: '700', color: '#625d5b', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                      Nome do Evento
                    </label>
                    <input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: Circuitinho BSB 2024"
                      required
                      data-testid="input-event-name"
                      style={{ width: '100%', backgroundColor: '#e8e8e7', border: 'none', borderRadius: '6px', padding: '12px 16px', fontSize: '14px', color: '#1a1c1c', fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', transition: 'box-shadow 0.15s, background-color 0.15s' }}
                      onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px rgba(253,118,26,0.25)'; e.currentTarget.style.backgroundColor = '#ffffff'; }}
                      onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.backgroundColor = '#e8e8e7'; }}
                    />
                  </div>

                  {/* Datas */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '10px', fontWeight: '700', color: '#625d5b', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                        Data Início
                      </label>
                      <input
                        id="startDate"
                        type="date"
                        value={formData.startDate}
                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                        required
                        data-testid="input-start-date"
                        style={{ width: '100%', backgroundColor: '#e8e8e7', border: 'none', borderRadius: '6px', padding: '12px 16px', fontSize: '13px', color: '#1a1c1c', fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', transition: 'box-shadow 0.15s, background-color 0.15s' }}
                        onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px rgba(253,118,26,0.25)'; e.currentTarget.style.backgroundColor = '#ffffff'; }}
                        onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.backgroundColor = '#e8e8e7'; }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '10px', fontWeight: '700', color: '#625d5b', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                        Saída Caminhão
                      </label>
                      <input
                        id="truckDepartureDate"
                        type="datetime-local"
                        value={formData.truckDepartureDate}
                        onChange={(e) => {
                          setFormData({ ...formData, truckDepartureDate: e.target.value });
                          if (e.target.value) setPrazosExpanded(true);
                        }}
                        required
                        data-testid="input-truck-date"
                        style={{ width: '100%', backgroundColor: '#e8e8e7', border: 'none', borderRadius: '6px', padding: '12px 16px', fontSize: '13px', color: '#1a1c1c', fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', transition: 'box-shadow 0.15s, background-color 0.15s' }}
                        onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px rgba(253,118,26,0.25)'; e.currentTarget.style.backgroundColor = '#ffffff'; }}
                        onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.backgroundColor = '#e8e8e7'; }}
                      />
                    </div>
                  </div>

                  {/* Patrocinadores */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '10px', fontWeight: '700', color: '#625d5b', textTransform: 'uppercase', letterSpacing: '0.12em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Building2 style={{ width: '12px', height: '12px', color: '#f97316' }} />
                      Patrocinadores
                      <span style={{ color: '#a8a29e', fontWeight: '400', textTransform: 'none', letterSpacing: 0 }}>(opcional)</span>
                    </label>
                    {sponsors.length === 0 ? (
                      <p style={{ fontSize: '13px', color: '#a8a29e', backgroundColor: '#f0efee', borderRadius: '8px', padding: '12px 16px' }}>
                        Nenhum patrocinador cadastrado.{" "}
                        <Link href="/patrocinadores" style={{ color: '#f97316', fontWeight: '600' }}>Cadastre agora</Link>
                      </p>
                    ) : (
                      <div style={{ backgroundColor: '#f0efee', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '160px', overflowY: 'auto' }}>
                        {sponsors.map((sponsor) => (
                          <label key={sponsor.id} htmlFor={`sponsor-${sponsor.id}`} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                            <Checkbox
                              id={`sponsor-${sponsor.id}`}
                              checked={selectedSponsorIds.includes(sponsor.id)}
                              onCheckedChange={(checked) => {
                                if (checked) setSelectedSponsorIds([...selectedSponsorIds, sponsor.id]);
                                else setSelectedSponsorIds(selectedSponsorIds.filter(id => id !== sponsor.id));
                              }}
                              data-testid={`checkbox-sponsor-${sponsor.id}`}
                              className="border-[#c4bfbb] bg-white data-[state=checked]:bg-[#fd761a] data-[state=checked]:border-[#fd761a] rounded-sm flex-shrink-0"
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontSize: '13px', fontWeight: '600', color: '#1a1c1c', lineHeight: 1.2 }}>{sponsor.name}</span>
                              {sponsor.company && (
                                <span style={{ fontSize: '10px', color: '#78716c', lineHeight: 1, fontWeight: '400' }}>{sponsor.company}</span>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Prazos colapsável */}
                  {(() => {
                    // Converte offset (dias) em YYYY-MM-DD para o input date
                    // truckDepartureDate é datetime-local (YYYY-MM-DDTHH:MM), pegamos só a data
                    const truckDateOnly = formData.truckDepartureDate ? formData.truckDepartureDate.slice(0, 10) : "";
                    const offsetToDateStr = (days: number, allDays = false): string => {
                      if (!truckDateOnly) return "";
                      const d = new Date(truckDateOnly + "T12:00:00");
                      d.setDate(d.getDate() + days);
                      if (!allDays) {
                        const dow = d.getDay();
                        if (dow === 6) d.setDate(d.getDate() - 1); // sábado → sexta
                        else if (dow === 0) d.setDate(d.getDate() + 1); // domingo → segunda
                      }
                      return d.toISOString().slice(0, 10);
                    };
                    // Converte data escolhida de volta em offset (dias)
                    const dateStrToOffset = (dateStr: string): number => {
                      if (!truckDateOnly || !dateStr) return 0;
                      const base = new Date(truckDateOnly + "T12:00:00");
                      const target = new Date(dateStr + "T12:00:00");
                      return Math.round((target.getTime() - base.getTime()) / 86400000);
                    };
                    const noStart = !truckDateOnly;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                        <button
                          type="button"
                          onClick={() => setPrazosExpanded(!prazosExpanded)}
                          data-testid="button-toggle-prazos"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', backgroundColor: '#f0efee', border: 'none', borderRadius: prazosExpanded ? '8px 8px 0 0' : '8px', padding: '10px 14px', cursor: 'pointer', transition: 'background-color 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e8e7e6'; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f0efee'; }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Clock style={{ width: '13px', height: '13px', color: '#f97316' }} />
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '10px', fontWeight: '700', color: '#625d5b', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Prazos</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    onClick={e => e.stopPropagation()}
                                    style={{ display: 'inline-flex', alignItems: 'center', cursor: 'help' }}
                                  >
                                    <HelpCircle style={{ width: '12px', height: '12px', color: '#a8a29e' }} />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" style={{ maxWidth: '220px', fontSize: '12px', lineHeight: '1.5' }}>
                                  Prazos que caírem no <strong>sábado</strong> são antecipados para <strong>sexta-feira</strong>. Os que caírem no <strong>domingo</strong> são adiados para <strong>segunda-feira</strong>. Exceção: Produção Gráfica funciona todos os dias.
                                </TooltipContent>
                              </Tooltip>
                            </span>
                            <span style={{ fontSize: '10px', color: '#a8a29e', fontWeight: '400', textTransform: 'none', letterSpacing: 0 }}>{noStart ? 'preencha a saída do caminhão primeiro' : 'relativo à saída do caminhão'}</span>
                          </div>
                          {prazosExpanded
                            ? <ChevronUp style={{ width: '14px', height: '14px', color: '#78716c' }} />
                            : <ChevronDown style={{ width: '14px', height: '14px', color: '#78716c' }} />
                          }
                        </button>
                        {prazosExpanded && (
                          <div style={{ backgroundColor: '#f0efee', borderRadius: '0 0 8px 8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                            {[
                              { key: 'deadlineListaImagens', label: 'Lista de Imagens', desc: 'Criação dos itens do evento', color: '#8b5cf6', allDays: false },
                              { key: 'deadlineEntregaLayouts', label: 'Entrega de Layouts', desc: 'Arte entrega os arquivos finais', color: '#3b82f6', allDays: false },
                              { key: 'deadlineAprovacaoLayout', label: 'Aprovação de Layout', desc: 'Aprovação pelo patrocinador', color: '#f59e0b', allDays: false },
                              { key: 'deadlineRevisaoLista', label: 'Revisão de Lista', desc: 'Criador revisa e lança todos os itens', color: '#10b981', allDays: false },
                              { key: 'deadlineProducaoGrafica', label: 'Produção Gráfica', desc: 'Prazo da gráfica para produzir', color: '#f97316', allDays: true },
                            ].map(({ key, label, desc, color, allDays }) => {
                              const currentDays = formData[key as keyof typeof formData] as number;
                              const dateVal = offsetToDateStr(currentDays, allDays);
                              return (
                                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#1a1c1c', lineHeight: 1.2 }}>{label}</div>
                                      <div style={{ fontSize: '10px', color: '#a8a29e', lineHeight: 1.2, marginTop: '1px' }}>{desc}</div>
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                    <input
                                      type="date"
                                      disabled={noStart}
                                      max={truckDateOnly || undefined}
                                      value={dateVal}
                                      onChange={(e) => {
                                        const offset = dateStrToOffset(e.target.value);
                                        setFormData({ ...formData, [key]: offset });
                                      }}
                                      data-testid={`input-${key}`}
                                      style={{ backgroundColor: noStart ? '#e8e7e6' : '#ffffff', border: '1px solid #d4d0cc', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: '600', color: noStart ? '#a8a29e' : '#1a1c1c', outline: 'none', cursor: noStart ? 'not-allowed' : 'pointer', transition: 'box-shadow 0.15s, border-color 0.15s' }}
                                      onFocus={e => { if (!noStart) { e.currentTarget.style.boxShadow = '0 0 0 2px rgba(253,118,26,0.25)'; e.currentTarget.style.borderColor = '#f97316'; } }}
                                      onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#d4d0cc'; }}
                                    />
                                    {!noStart && dateVal && (
                                      <span style={{ fontSize: '10px', color: '#a8a29e', fontWeight: '500', minWidth: '32px' }}>{currentDays}d</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                </div>

                {/* Rodapé */}
                <div style={{ padding: '24px', backgroundColor: '#fafaf9', borderTop: '1px solid rgba(224,192,177,0.2)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', borderRadius: '0 0 16px 16px', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={handleCloseDialog}
                    style={{ fontSize: '12px', fontWeight: '700', color: '#625d5b', background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px 16px', textTransform: 'uppercase', letterSpacing: '0.04em', borderRadius: '6px', transition: 'background-color 0.15s, color 0.15s', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e8e8e7'; e.currentTarget.style.color = '#1c1917'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#625d5b'; }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={createEventMutation.isPending || updateEventMutation.isPending}
                    data-testid="button-submit-event"
                    style={{ backgroundColor: '#1c1917', color: '#ffffff', borderRadius: '6px', fontWeight: '700', fontSize: '12px', padding: '10px 32px', textTransform: 'uppercase', letterSpacing: '0.04em', border: 'none', cursor: createEventMutation.isPending || updateEventMutation.isPending ? 'not-allowed' : 'pointer', transition: 'filter 0.15s, transform 0.1s', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                    onMouseEnter={e => { if (!createEventMutation.isPending && !updateEventMutation.isPending) e.currentTarget.style.filter = 'brightness(1.25)'; }}
                    onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
                    onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
                    onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    {editingEvent
                      ? (updateEventMutation.isPending ? "Salvando..." : "Salvar Alterações")
                      : (createEventMutation.isPending ? "Criando..." : "Salvar Evento")
                    }
                  </button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── FILTROS em painel contido ── */}
      <div style={{ backgroundColor: '#f3f4f3', borderRadius: '14px', padding: '16px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px' }}>
        {/* Grupo prioridade */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.07em', marginRight: '4px' }}>Prioridade:</span>
          {(Object.entries(priorityFilterConfig) as [PriorityLevel, typeof priorityFilterConfig.urgente][]).map(([priority, config]) => {
            const isSelected = selectedPriorities.includes(priority);
            return (
              <button
                key={priority}
                onClick={() => togglePriority(priority)}
                data-testid={`filter-priority-${priority}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '5px 13px', borderRadius: '99px',
                  fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                  border: `1px solid ${isSelected ? config.hex : 'transparent'}`,
                  backgroundColor: isSelected ? config.hex : '#e2e2e2',
                  color: isSelected ? '#ffffff' : '#57534e',
                  transition: 'all 0.15s'
                }}
              >
                {!isSelected && <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: config.hex, flexShrink: 0 }} />}
                {config.label}
                <span style={{ opacity: 0.6 }}>({config.count})</span>
              </button>
            );
          })}
          {selectedPriorities.length > 0 && (
            <button onClick={() => setSelectedPriorities([])} data-testid="button-clear-filters"
              style={{ padding: '5px 10px', borderRadius: '99px', fontSize: '11px', cursor: 'pointer', border: 'none', backgroundColor: 'transparent', color: '#a8a29e' }}>
              Limpar
            </button>
          )}
        </div>

        {/* Divisor */}
        <div style={{ width: '1px', height: '24px', backgroundColor: '#d4d4d0', flexShrink: 0 }} />

        {/* Grupo data */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger style={{ backgroundColor: '#e2e2e2', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', color: '#57534e', height: '32px', padding: '0 12px', width: '170px' }} data-testid="select-month-filter">
              <SelectValue placeholder="Mês de saída" />
            </SelectTrigger>
            <SelectContent>
              {months.map((month) => (
                <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            onClick={() => setNext10DaysFilter(!next10DaysFilter)}
            data-testid="button-next-10-days-filter"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '5px 13px', borderRadius: '8px',
              fontSize: '12px', fontWeight: '700', cursor: 'pointer',
              border: 'none',
              backgroundColor: next10DaysFilter ? '#1c1917' : '#e2e2e2',
              color: next10DaysFilter ? '#ffffff' : '#57534e',
              transition: 'all 0.15s'
            }}
          >
            <Truck style={{ width: '13px', height: '13px' }} />
            Próximos 10 dias
          </button>

          {(monthFilter !== "all" || next10DaysFilter) && (
            <button onClick={() => { setMonthFilter("all"); setNext10DaysFilter(false); }} data-testid="button-clear-date-filters"
              style={{ padding: '5px 10px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', border: 'none', backgroundColor: 'transparent', color: '#a8a29e' }}>
              Limpar datas
            </button>
          )}
        </div>
      </div>

      {/* ── CONTEÚDO ── */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid #e7e5e4', borderTopColor: '#f97316', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : events.length === 0 ? (
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: '14px', padding: '72px 24px', textAlign: 'center' }}>
          <Package style={{ width: '44px', height: '44px', color: '#d4d0cb', margin: '0 auto 16px' }} />
          <h3 style={{ color: '#1c1917', fontSize: '17px', fontWeight: '700', marginBottom: '6px', fontFamily: "'Space Grotesk', sans-serif" }}>Nenhum evento criado</h3>
          <p style={{ color: '#78716c', fontSize: '13px', marginBottom: '24px' }}>Comece criando seu primeiro evento de produção</p>
          <Button onClick={() => setOpen(true)} style={{ backgroundColor: '#f97316', color: '#ffffff', borderRadius: '10px', fontWeight: '700', boxShadow: '0 4px 14px rgba(249,115,22,0.25)' }}>
            <Plus className="h-4 w-4 mr-2" />
            Criar Primeiro Evento
          </Button>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: '14px', padding: '72px 24px', textAlign: 'center' }}>
          <Search style={{ width: '40px', height: '40px', color: '#d4d0cb', margin: '0 auto 16px' }} />
          <h3 style={{ color: '#1c1917', fontSize: '17px', fontWeight: '700', marginBottom: '6px', fontFamily: "'Space Grotesk', sans-serif" }}>Nenhum evento encontrado</h3>
          <p style={{ color: '#78716c', fontSize: '13px' }}>Tente uma busca ou filtro diferente</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredEvents.map((event) => {
            const itemCount = event.items?.length || 0;

            const getTruckUrgency = () => {
              const now = new Date();
              const departure = new Date(event.truckDepartureDate);
              const hoursUntilDeparture = (departure.getTime() - now.getTime()) / (1000 * 60 * 60);
              if (hoursUntilDeparture < 0) return 'departed';
              if (hoursUntilDeparture < 24) return 'urgent';
              if (hoursUntilDeparture < 48) return 'warning';
              return 'normal';
            };
            const truckUrgency = getTruckUrgency();

            const priorityConfig = getPriorityConfig(event.priority);
            const isCompleted = event.status === 'completed';
            const cardBorderHex = isCompleted ? '#10b981' : priorityConfig.hex;
            const deliveredCount = event.items?.filter((item: any) => item.status === 'delivered').length || 0;
            const progressPct = itemCount > 0 ? Math.round((deliveredCount / itemCount) * 100) : 0;
            const progressColor = progressPct === 100 ? '#10b981' : cardBorderHex;

            const truckColor = truckUrgency === 'urgent' ? '#ef4444' : truckUrgency === 'warning' ? '#f59e0b' : (isCompleted ? '#6ee7b7' : '#78716c');
            const truckTextColor = truckUrgency === 'urgent' ? '#ef4444' : truckUrgency === 'warning' ? '#f59e0b' : (isCompleted ? '#d1fae5' : '#1c1917');

            // ── Shared action buttons (invisible until hover) ──
            const ActionButtons = ({ dark = false }: { dark?: boolean }) => (
              <div
                className="opacity-0 group-hover:opacity-100"
                style={{ position: 'absolute', top: 0, right: 0, padding: '16px', display: 'flex', gap: '6px', transition: 'opacity 0.2s', zIndex: 10 }}
                onClick={(e) => e.preventDefault()}
              >
                {!dark && (
                  <button
                    onClick={(e) => handleSetPriority(event, e)}
                    title="Definir prioridade"
                    data-testid={`button-priority-event-${event.id}`}
                    style={{ padding: '8px', backgroundColor: '#f9f9f8', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', color: event.priority ? cardBorderHex : '#a8a29e', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}
                  >
                    <Flag style={{ width: '13px', height: '13px', fill: event.priority ? cardBorderHex : 'none' }} />
                  </button>
                )}
                {(hasPermission("admin") || hasPermission("solicitacao")) && (
                  <button onClick={(e) => handleEdit(event, e)} data-testid={`button-edit-event-${event.id}`}
                    style={{ padding: '8px', backgroundColor: dark ? 'rgba(255,255,255,0.1)' : '#f9f9f8', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', color: dark ? '#d4d0cb' : '#78716c', boxShadow: dark ? 'none' : '0 1px 4px rgba(0,0,0,0.08)' }}>
                    <Pencil style={{ width: '13px', height: '13px' }} />
                  </button>
                )}
                {hasPermission("admin") && (
                  <button onClick={(e) => handleDelete(event.id, e)} data-testid={`button-delete-event-${event.id}`}
                    style={{ padding: '8px', backgroundColor: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', color: dark ? '#f87171' : '#ef4444', boxShadow: dark ? 'none' : '0 1px 4px rgba(0,0,0,0.08)' }}>
                    <Trash2 style={{ width: '13px', height: '13px' }} />
                  </button>
                )}
              </div>
            );

            // ── Card Concluído: branco com borda verde e ícone decorativo ──
            if (isCompleted) {
              return (
                <Link key={event.id} href={`/eventos/${event.id}`}>
                  <div
                    className="group relative cursor-pointer bg-white rounded-xl flex flex-col gap-4 overflow-hidden"
                    style={{
                      border: '1px solid #e7e5e4',
                      borderLeft: '4px solid #10b981',
                      padding: '24px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      transition: 'box-shadow 0.3s ease, transform 0.3s ease',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 20px 40px rgba(0,0,0,0.1)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
                    data-testid={`card-event-${event.id}`}
                  >
                    {/* Ícone decorativo de fundo */}
                    <div style={{ position: 'absolute', right: '-16px', bottom: '-16px', opacity: 0.03, pointerEvents: 'none' }}>
                      <CheckCircle style={{ width: '120px', height: '120px', color: '#10b981' }} />
                    </div>

                    <ActionButtons />

                    {/* Topo: badge + id */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
                      <span style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', padding: '4px 10px', borderRadius: '6px' }}>
                        Concluído
                      </span>
                      {event.displayId && (
                        <span style={{ fontSize: '11px', fontWeight: '500', color: '#c0bbb8' }}>#{String(event.displayId).padStart(4, '0')}</span>
                      )}
                    </div>

                    {/* Nome */}
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '18px', fontWeight: '700', color: '#1c1917', lineHeight: 1.25, margin: 0 }}>
                        {event.name}
                      </h3>
                    </div>

                    {/* Datas */}
                    <div className="grid grid-cols-2 gap-4" style={{ margin: '4px 0', position: 'relative', zIndex: 1 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <p style={{ fontSize: '10px', fontWeight: '700', color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Início</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#44403c' }}>
                          <Calendar style={{ width: '14px', height: '14px', color: '#10b981', flexShrink: 0 }} />
                          <span style={{ fontSize: '12px', fontWeight: '700' }}>
                            {new Date(event.startDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <p style={{ fontSize: '10px', fontWeight: '700', color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Saída Caminhão</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Truck style={{ width: '14px', height: '14px', color: '#10b981', flexShrink: 0 }} />
                          <span style={{ fontSize: '12px', fontWeight: '700', color: '#44403c' }}>
                            {new Date(event.truckDepartureDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')}
                            {' · '}
                            {new Date(event.truckDepartureDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Progresso */}
                    <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #f0efee', position: 'relative', zIndex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#57534e' }}>{deliveredCount}/{itemCount} Peças</span>
                        <span style={{ fontSize: '11px', fontWeight: '800', color: '#10b981' }}>Finalizado</span>
                      </div>
                      <div style={{ width: '100%', backgroundColor: '#f0efee', borderRadius: '99px', height: '6px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', backgroundColor: '#10b981', borderRadius: '99px', width: '100%' }} />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            }

            // ── Card Normal (com prioridade) ──
            return (
              <Link key={event.id} href={`/eventos/${event.id}`}>
                <div
                  className="group relative cursor-pointer bg-white rounded-xl flex flex-col gap-4"
                  style={{
                    border: '1px solid #e7e5e4',
                    borderLeft: `4px solid ${cardBorderHex}`,
                    padding: '24px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    transition: 'box-shadow 0.3s ease, transform 0.3s ease',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 20px 40px rgba(0,0,0,0.1)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
                  data-testid={`card-event-${event.id}`}
                >
                  <ActionButtons />

                  {/* Linha 1: badge prioridade + id */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    {!event.priority ? (
                      <span className="animate-pulse" style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#f97316', backgroundColor: '#fff7ed', padding: '4px 10px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <AlertCircle style={{ width: '10px', height: '10px' }} />
                        Sem prioridade
                      </span>
                    ) : (
                      <span style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.07em', color: cardBorderHex, backgroundColor: cardBorderHex + '12', padding: '4px 10px', borderRadius: '6px' }}>
                        {priorityConfig.label}
                      </span>
                    )}
                    {event.displayId && (
                      <span style={{ fontSize: '11px', fontWeight: '500', color: '#c0bbb8' }}>#{String(event.displayId).padStart(4, '0')}</span>
                    )}
                  </div>

                  {/* Nome */}
                  <div>
                    <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '18px', fontWeight: '700', color: '#1c1917', lineHeight: 1.25, margin: 0 }}>
                      {event.name}
                    </h3>
                  </div>

                  {/* Datas — label + ícone + valor */}
                  <div className="grid grid-cols-2 gap-4" style={{ margin: '4px 0' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <p style={{ fontSize: '10px', fontWeight: '700', color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Início</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#44403c' }}>
                        <Calendar style={{ width: '14px', height: '14px', color: cardBorderHex, flexShrink: 0 }} />
                        <span style={{ fontSize: '12px', fontWeight: '700' }}>
                          {new Date(event.startDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <p style={{ fontSize: '10px', fontWeight: '700', color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Saída Caminhão</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} className={truckUrgency === 'urgent' ? 'animate-pulse' : ''}>
                        <Truck style={{ width: '14px', height: '14px', color: truckColor, flexShrink: 0 }} />
                        <span style={{ fontSize: '12px', fontWeight: '700', color: truckTextColor }}>
                          {new Date(event.truckDepartureDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')}
                          {' · '}
                          {new Date(event.truckDepartureDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Progresso */}
                  <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #f0efee' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#57534e' }}>{deliveredCount}/{itemCount} Entregues</span>
                      <span style={{ fontSize: '11px', fontWeight: '800', color: '#1c1917' }}>{progressPct}%</span>
                    </div>
                    <div style={{ width: '100%', backgroundColor: '#f0efee', borderRadius: '99px', height: '6px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', backgroundColor: progressColor, borderRadius: '99px', width: `${progressPct}%`, transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}

        </div>
      )}

      <AlertDialog open={!!deletingEventId} onOpenChange={() => setDeletingEventId(null)}>
        <AlertDialogContent style={{ maxWidth: "420px", backgroundColor: "#ffffff", borderRadius: "16px", padding: "0", border: "none", boxShadow: "0 16px 32px -12px rgba(26,28,28,0.2)", overflow: "hidden" }}>
          <div style={{ padding: "32px 32px 8px 32px" }}>
            <AlertDialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "20px", fontWeight: "700", letterSpacing: "-0.02em", color: "#1c1917", margin: 0 }}>
              Confirmar Exclusão
            </AlertDialogTitle>

            {/* Banner aviso — borda esquerda laranja */}
            <div style={{ marginTop: "24px", padding: "16px", backgroundColor: "#fff7ed", borderLeft: "4px solid #f97316", borderRadius: "0 8px 8px 0", display: "flex", alignItems: "flex-start", gap: "12px" }}>
              <AlertTriangle style={{ width: "18px", height: "18px", color: "#f97316", flexShrink: 0, marginTop: "1px" }} />
              <p style={{ fontSize: "12px", fontWeight: "600", color: "#783200", margin: 0, lineHeight: 1.6 }}>
                Todas as peças associadas a este evento também serão removidas permanentemente.
              </p>
            </div>

            {/* Descrição com nome do evento */}
            <AlertDialogDescription style={{ fontSize: "14px", color: "#78716c", lineHeight: 1.6, marginTop: "16px" }}>
              Tem certeza que deseja excluir o evento{" "}
              <strong style={{ color: "#1a1c1c", fontWeight: "600" }}>
                "{events.find((e: any) => e.id === deletingEventId)?.name || "este evento"}"
              </strong>
              ? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </div>

          <AlertDialogFooter style={{ padding: "16px 32px 32px 32px", display: "flex", flexDirection: "row", justifyContent: "flex-end", gap: "10px" }}>
            <AlertDialogCancel
              style={{ padding: "9px 24px", backgroundColor: "transparent", border: "1px solid #e0c0b1", borderRadius: "6px", fontSize: "12px", fontWeight: "700", color: "#625d5b", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.04em", fontFamily: "'Plus Jakarta Sans', sans-serif", transition: "background-color 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f3f4f3")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingEventId && deleteEventMutation.mutate(deletingEventId)}
              data-testid="button-confirm-delete-event"
              style={{ padding: "9px 24px", backgroundColor: "#ba1a1a", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: "700", color: "#ffffff", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.04em", fontFamily: "'Plus Jakarta Sans', sans-serif", display: "flex", alignItems: "center", gap: "8px", transition: "filter 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.1)")}
              onMouseLeave={(e) => (e.currentTarget.style.filter = "brightness(1)")}
            >
              <Trash2 style={{ width: "14px", height: "14px" }} />
              {deleteEventMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={priorityDialogOpen} onOpenChange={setPriorityDialogOpen}>
        <DialogContent className="sm:max-w-md p-0 gap-0" style={{ borderRadius: '14px', overflow: 'hidden' }}>
          {/* Cabeçalho */}
          <div style={{ backgroundColor: '#f3f4f3', borderBottom: '1px solid #e7e5e4', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '16px', fontWeight: '700', color: '#1c1917', margin: 0, textTransform: 'uppercase', letterSpacing: '-0.02em' }}>
              Definir Prioridade
            </DialogTitle>
            {selectedEventForPriority && (
              <span style={{ fontSize: '10px', fontWeight: '700', color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {selectedEventForPriority.name.length > 20 ? selectedEventForPriority.name.slice(0, 20) + '…' : selectedEventForPriority.name}
              </span>
            )}
          </div>

          {/* Corpo — grid de opções horizontais */}
          <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[
              { key: 'baixa',   label: 'Baixa',   color: '#3b82f6', hoverBorder: '#3b82f6', hoverText: '#1d4ed8', hoverBg: '#eff6ff' },
              { key: 'media',   label: 'Média',   color: '#a855f7', hoverBorder: '#a855f7', hoverText: '#7e22ce', hoverBg: '#faf5ff' },
              { key: 'alta',    label: 'Alta',    color: '#f59e0b', hoverBorder: '#f59e0b', hoverText: '#b45309', hoverBg: '#fffbeb' },
              { key: 'urgente', label: 'Urgente', color: '#ef4444', hoverBorder: '#f97316', hoverText: '#9a3412', hoverBg: '#fff7ed' },
            ].map(({ key, label, color, hoverBorder, hoverText, hoverBg }) => {
              const isSelected = selectedEventForPriority?.priority === key;
              return (
                <button
                  key={key}
                  onClick={() => handlePrioritySelect(key)}
                  disabled={updatePriorityMutation.isPending}
                  style={{
                    height: '72px',
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '0 16px',
                    borderRadius: '10px',
                    border: isSelected ? `2px solid ${hoverBorder}` : '2px solid #e7e5e4',
                    backgroundColor: isSelected ? hoverBg : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = hoverBorder;
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = hoverBg;
                      (e.currentTarget.querySelector('.prio-label') as HTMLElement).style.color = hoverText;
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = '#e7e5e4';
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#ffffff';
                      (e.currentTarget.querySelector('.prio-label') as HTMLElement).style.color = '#44403c';
                    }
                  }}
                  data-testid={`button-priority-${key}`}
                >
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                  <span className="prio-label" style={{ fontWeight: '700', fontSize: '13px', color: isSelected ? hoverText : '#44403c', transition: 'color 0.15s' }}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Rodapé */}
          <div style={{ backgroundColor: '#f3f4f3', borderTop: '1px solid #e7e5e4', padding: '12px 24px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setPriorityDialogOpen(false)}
              style={{ fontSize: '11px', fontWeight: '700', color: '#a8a29e', background: 'none', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#1c1917')}
              onMouseLeave={e => (e.currentTarget.style.color = '#a8a29e')}
            >
              Cancelar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
