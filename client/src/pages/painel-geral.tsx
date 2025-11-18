import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Calendar, User, Package2, History, MessageSquare, ExternalLink, Truck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommentsSection } from "@/components/comments-section";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function PainelGeral() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [sponsorFilter, setSponsorFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/items"],
    placeholderData: [],
  });

  const { data: events = [] } = useQuery<any[]>({
    queryKey: ["/api/events"],
    placeholderData: [],
  });

  const { data: sponsors = [] } = useQuery<any[]>({
    queryKey: ["/api/sponsors"],
    placeholderData: [],
  });

  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs"],
    placeholderData: [],
  });

  // Pegar tipos únicos dos itens
  const uniqueTypes = Array.from(new Set(items.map(item => item.type))).sort();

  // Função auxiliar para aplicar filtros (exceto status)
  const applyBaseFilters = (item: any) => {
    const matchesSearch = 
      item.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.event?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.displayId?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEvent = eventFilter === "all" || item.eventId === eventFilter;
    const matchesType = typeFilter === "all" || item.type === typeFilter;
    
    // Filtro por patrocinador (verifica se o item tem o patrocinador selecionado)
    const matchesSponsor = sponsorFilter === "all" || 
      (item.sponsors && Array.isArray(item.sponsors) && item.sponsors.some((s: any) => s.id === sponsorFilter));
    
    // Filtro por data (várias opções)
    const matchesDate = dateFilter === "all" || (() => {
      if (!item.event?.startDate) return false;
      const eventDate = new Date(item.event.startDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const eventDateOnly = new Date(eventDate);
      eventDateOnly.setHours(0, 0, 0, 0);
      const diffTime = eventDateOnly.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      switch(dateFilter) {
        case 'today': return diffDays === 0;
        case 'next3days': return diffDays >= 0 && diffDays <= 3;
        case 'next7days': return diffDays >= 0 && diffDays <= 7;
        case 'next10days': return diffDays >= 0 && diffDays <= 10;
        case 'next15days': return diffDays >= 0 && diffDays <= 15;
        case 'next30days': return diffDays >= 0 && diffDays <= 30;
        case 'overdue': return diffDays < 0;
        default: return true;
      }
    })();
    
    return matchesSearch && matchesEvent && matchesType && matchesSponsor && matchesDate;
  };

  // Items para calcular stats (SEM filtro de status - números fixos nos cards)
  const statsItems = items.filter(applyBaseFilters);

  // Função para verificar se o item corresponde ao status selecionado (incluindo status antigos)
  const matchesStatusFilter = (item: any, filter: string) => {
    if (filter === "all") return true;
    
    // Mapeamento de status antigos para novos
    const statusMap: Record<string, string[]> = {
      'awaiting_approval': ['awaiting_approval', 'awaiting_sponsor_approval'],
      'awaiting_finalization': ['awaiting_finalization', 'sponsor_approved'],
      'awaiting_final_review': ['awaiting_final_review', 'awaiting_creator_review'],
    };
    
    // Se o filtro tem mapeamento, aceita qualquer um dos status
    if (statusMap[filter]) {
      return statusMap[filter].includes(item.status);
    }
    
    // Senão, comparação exata
    return item.status === filter;
  };

  // Items para exibir na tabela (COM filtro de status)
  const filteredItems = statsItems
    .filter((item) => matchesStatusFilter(item, statusFilter))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  // Agrupar itens por evento (usando eventId como chave única)
  const groupedItems = filteredItems.reduce((acc, item) => {
    const eventKey = item.eventId || "no-event";
    const eventName = item.event?.name || "Sem Evento";
    if (!acc[eventKey]) {
      acc[eventKey] = {
        eventId: item.eventId,
        eventName: eventName,
        items: []
      };
    }
    acc[eventKey].items.push(item);
    return acc;
  }, {} as Record<string, { eventId: string | null, eventName: string, items: any[] }>);

  // Stats baseados APENAS nos filtros dropdown (não muda ao clicar nos cards)
  const stats = {
    total: statsItems.length,
    requested: statsItems.filter(i => i.status === 'requested').length,
    awaitingLinking: statsItems.filter(i => i.status === 'awaiting_linking').length,
    awaitingSubmission: statsItems.filter(i => i.status === 'awaiting_submission').length,
    awaitingApproval: statsItems.filter(i => i.status === 'awaiting_approval' || i.status === 'awaiting_sponsor_approval').length,
    awaitingFinalization: statsItems.filter(i => i.status === 'awaiting_finalization' || i.status === 'sponsor_approved').length,
    awaitingFinalReview: statsItems.filter(i => i.status === 'awaiting_final_review' || i.status === 'awaiting_creator_review').length,
    readyForProduction: statsItems.filter(i => i.status === 'ready_for_production').length,
    approved: statsItems.filter(i => i.status === 'approved').length,
    inProduction: statsItems.filter(i => i.status === 'inProduction').length,
    produced: statsItems.filter(i => i.status === 'produced').length,
    delivered: statsItems.filter(i => i.status === 'delivered').length,
  };

  const getItemLogs = (itemId: string) => {
    return auditLogs
      .filter(log => log.entityId === itemId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  };

  const formatDateTime = (dateString: string) => {
    return format(new Date(dateString), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground" data-testid="title-painel-geral">
          Painel de Status Geral
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Acompanhamento em tempo real de todos os itens em produção
        </p>
      </div>

      {/* Dashboard - 12 Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'all' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className="text-xs font-medium">Total</CardTitle>
            <Package2 className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold" data-testid="stat-total">{stats.total}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'requested' ? 'ring-2 ring-yellow-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'requested' ? 'all' : 'requested')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className="text-xs font-medium">Solicitado</CardTitle>
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-500"></div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-yellow-700 dark:text-yellow-400">{stats.requested}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'awaiting_linking' ? 'ring-2 ring-orange-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'awaiting_linking' ? 'all' : 'awaiting_linking')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className="text-xs font-medium">Aguard. Vinculação</CardTitle>
            <div className="h-2.5 w-2.5 rounded-full bg-orange-500"></div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-orange-700 dark:text-orange-400">{stats.awaitingLinking}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'awaiting_submission' ? 'ring-2 ring-blue-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'awaiting_submission' ? 'all' : 'awaiting_submission')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className="text-xs font-medium">Aguard. Envio</CardTitle>
            <div className="h-2.5 w-2.5 rounded-full bg-blue-500"></div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-blue-700 dark:text-blue-400">{stats.awaitingSubmission}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'awaiting_approval' || statusFilter === 'awaiting_sponsor_approval' ? 'ring-2 ring-rose-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'awaiting_approval' || statusFilter === 'awaiting_sponsor_approval' ? 'all' : 'awaiting_approval')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className="text-xs font-medium">Aguard. Aprovação</CardTitle>
            <div className="h-2.5 w-2.5 rounded-full bg-rose-500"></div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-rose-700 dark:text-rose-400">{stats.awaitingApproval}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'awaiting_finalization' || statusFilter === 'sponsor_approved' ? 'ring-2 ring-purple-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'awaiting_finalization' || statusFilter === 'sponsor_approved' ? 'all' : 'awaiting_finalization')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className="text-xs font-medium">Aguard. Finalização</CardTitle>
            <div className="h-2.5 w-2.5 rounded-full bg-purple-500"></div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-purple-700 dark:text-purple-400">{stats.awaitingFinalization}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'awaiting_final_review' || statusFilter === 'awaiting_creator_review' ? 'ring-2 ring-violet-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'awaiting_final_review' || statusFilter === 'awaiting_creator_review' ? 'all' : 'awaiting_final_review')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className="text-xs font-medium">Aguard. Revisão</CardTitle>
            <div className="h-2.5 w-2.5 rounded-full bg-violet-500"></div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-violet-700 dark:text-violet-400">{stats.awaitingFinalReview}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'ready_for_production' ? 'ring-2 ring-cyan-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'ready_for_production' ? 'all' : 'ready_for_production')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className="text-xs font-medium">Pronto Produção</CardTitle>
            <div className="h-2.5 w-2.5 rounded-full bg-cyan-500"></div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-cyan-700 dark:text-cyan-400">{stats.readyForProduction}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'approved' ? 'ring-2 ring-green-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'approved' ? 'all' : 'approved')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className="text-xs font-medium">Liberado</CardTitle>
            <div className="h-2.5 w-2.5 rounded-full bg-green-500"></div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-green-700 dark:text-green-400">{stats.approved}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'inProduction' ? 'ring-2 ring-status-production' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'inProduction' ? 'all' : 'inProduction')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className="text-xs font-medium">Em Produção</CardTitle>
            <Package2 className="h-3.5 w-3.5 text-status-production" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-status-production">{stats.inProduction}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'produced' ? 'ring-2 ring-fuchsia-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'produced' ? 'all' : 'produced')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className="text-xs font-medium">Produzido</CardTitle>
            <div className="h-2.5 w-2.5 rounded-full bg-fuchsia-500"></div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-fuchsia-700 dark:text-fuchsia-400">{stats.produced}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'delivered' ? 'ring-2 ring-emerald-600' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'delivered' ? 'all' : 'delivered')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className="text-xs font-medium">Entregue</CardTitle>
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-600"></div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{stats.delivered}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {/* Linha 1: Busca */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por evento, tipo ou ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
            
            {/* Linha 2: Selects */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger data-testid="select-event-filter">
                  <SelectValue placeholder="Evento" />
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

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger data-testid="select-type-filter">
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

              <div className="lg:col-span-2">
                <Select value={sponsorFilter} onValueChange={setSponsorFilter}>
                  <SelectTrigger data-testid="select-sponsor-filter" className="text-left whitespace-normal leading-tight min-h-9">
                    <SelectValue placeholder="Patrocinador" className="whitespace-normal break-words" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os patrocinadores</SelectItem>
                    {[...sponsors].sort((a, b) => a.name.localeCompare(b.name)).map((sponsor: any) => (
                      <SelectItem key={sponsor.id} value={sponsor.id}>
                        {sponsor.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="select-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="awaiting_approval">Aguardando Aprovação</SelectItem>
                  <SelectItem value="awaiting_final_review">Aguardando Revisão Final</SelectItem>
                  <SelectItem value="awaiting_finalization">Aguardando Finalização</SelectItem>
                  <SelectItem value="awaiting_linking">Aguardando Vinculação</SelectItem>
                  <SelectItem value="awaiting_submission">Aguardando Envio</SelectItem>
                  <SelectItem value="delivered">Entregue</SelectItem>
                  <SelectItem value="inProduction">Em Produção</SelectItem>
                  <SelectItem value="approved">Liberado</SelectItem>
                  <SelectItem value="produced">Produzido</SelectItem>
                  <SelectItem value="ready_for_production">Pronto p/ Produção</SelectItem>
                  <SelectItem value="requested">Solicitado</SelectItem>
                </SelectContent>
              </Select>

              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger data-testid="select-date-filter">
                  <SelectValue placeholder="Data" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as datas</SelectItem>
                  <SelectItem value="overdue">Atrasados</SelectItem>
                  <SelectItem value="today">Hoje</SelectItem>
                  <SelectItem value="next3days">Próximos 3 dias</SelectItem>
                  <SelectItem value="next7days">Próximos 7 dias</SelectItem>
                  <SelectItem value="next10days">Próximos 10 dias</SelectItem>
                  <SelectItem value="next15days">Próximos 15 dias</SelectItem>
                  <SelectItem value="next30days">Próximos 30 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items - Agrupados por Evento */}
      <div className="space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : filteredItems.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <p className="text-muted-foreground">Nenhum item encontrado</p>
            </CardContent>
          </Card>
        ) : (
          Object.entries(groupedItems).map(([eventKey, eventData]) => {
            const groupData = eventData as { eventId: string | null, eventName: string, items: any[] };
            return (
              <Card key={eventKey}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    {groupData.eventName}
                    <Badge variant="secondary" className="ml-2">
                      {groupData.items.length} {groupData.items.length === 1 ? 'item' : 'itens'}
                    </Badge>
                  </CardTitle>
                  {/* Datas do Evento */}
                  {groupData.items[0]?.event && (
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-2">
                      {groupData.items[0].event.startDate && (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>Evento: {format(new Date(groupData.items[0].event.startDate), "dd/MM/yyyy", { locale: ptBR })}</span>
                        </div>
                      )}
                      {groupData.items[0].event.truckDepartureDate && (
                        <div className="flex items-center gap-1.5">
                          <Truck className="h-3.5 w-3.5" />
                          <span>Saída caminhão: {format(new Date(groupData.items[0].event.truckDepartureDate), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                        </div>
                      )}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left py-3 px-4 font-semibold text-sm text-muted-foreground">ID</th>
                          <th className="text-left py-3 px-4 font-semibold text-sm text-muted-foreground">Tipo</th>
                          <th className="text-left py-3 px-4 font-semibold text-sm text-muted-foreground">Descrição</th>
                          <th className="text-left py-3 px-4 font-semibold text-sm text-muted-foreground">Arquivo</th>
                          <th className="text-left py-3 px-4 font-semibold text-sm text-muted-foreground">Visual</th>
                          <th className="text-center py-3 px-4 font-semibold text-sm text-muted-foreground">Qtd</th>
                          <th className="text-center py-3 px-4 font-semibold text-sm text-muted-foreground">m²</th>
                          <th className="text-left py-3 px-4 font-semibold text-sm text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupData.items.map((item: any, index: number) => (
                          <Dialog key={item.id}>
                            <DialogTrigger asChild>
                              <tr
                                className={`border-b hover-elevate cursor-pointer transition-colors ${
                                  index % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                                }`}
                                data-testid={`item-row-${item.id}`}
                              >
                                <td className="py-3 px-4">
                                  <span className="font-mono font-bold text-primary text-sm" data-testid={`text-display-id-${item.id}`}>
                                    {item.displayId}
                                  </span>
                                </td>
                                <td className="py-3 px-4">
                                  <span className="font-semibold text-sm">{item.type}</span>
                                </td>
                                <td className="py-3 px-4 max-w-xs">
                                  {item.description ? (
                                    <span className="text-sm text-muted-foreground truncate block">{item.description}</span>
                                  ) : (
                                    <span className="text-muted-foreground text-xs italic">—</span>
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  {item.fileWidth && item.fileHeight ? (
                                    <span className="text-sm">{item.fileWidth} × {item.fileHeight}</span>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  {item.visualWidth && item.visualHeight ? (
                                    <span className="text-sm">{item.visualWidth} × {item.visualHeight}</span>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <span className="font-bold text-sm">{item.quantity} un.</span>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <span className="font-bold text-primary text-sm">{item.calculatedM2}</span>
                                </td>
                                <td className="py-3 px-4">
                                  <StatusBadge status={item.status} />
                                </td>
                              </tr>
                            </DialogTrigger>

                      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader className="pb-4 border-b">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <DialogTitle className="text-2xl font-bold mb-3 flex items-center gap-3">
                                <span className="font-mono text-primary">{item.displayId}</span>
                                <StatusBadge status={item.status} />
                              </DialogTitle>
                              {item.event && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Calendar className="h-4 w-4" />
                                  <span className="font-medium">{item.event.name}</span>
                                  <span className="mx-2">•</span>
                                  <span>{new Date(item.event.startDate).toLocaleDateString('pt-BR')}</span>
                                </div>
                              )}
                            </div>
                            <Badge variant="outline" className="text-base px-4 py-2 shrink-0">
                              {item.type}
                            </Badge>
                          </div>
                        </DialogHeader>

                        <div className="space-y-6 mt-6">
                          {/* Grid de informações principais */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Card: Especificações */}
                            <Card>
                              <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-semibold uppercase text-muted-foreground flex items-center gap-2">
                                  <Package2 className="h-4 w-4" />
                                  Especificações
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                  <div>
                                    <span className="text-muted-foreground block text-xs mb-1">Material</span>
                                    <span className="font-semibold">{item.material}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground block text-xs mb-1">Acabamento</span>
                                    <span className="font-semibold">{item.finish}</span>
                                  </div>
                                  {item.visualWidth && item.visualHeight && (
                                    <div>
                                      <span className="text-muted-foreground block text-xs mb-1">Dimensão Visual</span>
                                      <span className="font-semibold">{item.visualWidth} × {item.visualHeight}</span>
                                    </div>
                                  )}
                                  {item.fileWidth && item.fileHeight && (
                                    <div>
                                      <span className="text-muted-foreground block text-xs mb-1">Dimensão Arquivo</span>
                                      <span className="font-semibold">{item.fileWidth} × {item.fileHeight}</span>
                                    </div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>

                            {/* Card: Produção */}
                            <Card>
                              <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-semibold uppercase text-muted-foreground">
                                  Produção
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                  <div>
                                    <span className="text-muted-foreground block text-xs mb-1">Quantidade Solicitada</span>
                                    <span className="font-semibold text-lg">{item.quantity} un.</span>
                                  </div>
                                  {item.quantityProduced !== null && (
                                    <div>
                                      <span className="text-muted-foreground block text-xs mb-1">Quantidade Produzida</span>
                                      <span className="font-semibold text-lg text-status-production">{item.quantityProduced} un.</span>
                                    </div>
                                  )}
                                  <div>
                                    <span className="text-muted-foreground block text-xs mb-1">Total m²</span>
                                    <span className="font-semibold text-lg text-primary">{item.calculatedM2}</span>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </div>

                          {/* Patrocinadores e Observações */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Card: Patrocinadores */}
                            {item.sponsors && item.sponsors.length > 0 && (() => {
                              // Fazer lookup dos sponsors pelos IDs
                              const itemSponsorNames = item.sponsors
                                .map((sponsorData: any) => {
                                  // Se já tem o objeto completo, usar diretamente
                                  if (sponsorData.name) return sponsorData.name;
                                  // Senão, fazer lookup pelo ID
                                  const sponsor = sponsors.find((s: any) => s.id === sponsorData.id);
                                  return sponsor?.name || 'Patrocinador desconhecido';
                                })
                                .filter(Boolean);
                              
                              if (itemSponsorNames.length === 0) return null;
                              
                              return (
                                <Card>
                                  <CardHeader className="pb-3">
                                    <CardTitle className="text-sm font-semibold uppercase text-muted-foreground">
                                      Patrocinadores
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="flex flex-wrap gap-2">
                                      {itemSponsorNames.map((name: string, idx: number) => (
                                        <Badge key={idx} variant="secondary" className="text-xs">
                                          {name}
                                        </Badge>
                                      ))}
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })()}

                            {/* Card: Observações */}
                            <Card className={!item.sponsors || item.sponsors.length === 0 ? 'md:col-span-2' : ''}>
                              <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-semibold uppercase text-muted-foreground">
                                  Observações
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                {item.observations ? (
                                  <p className="text-sm leading-relaxed">{item.observations}</p>
                                ) : (
                                  <p className="text-sm text-muted-foreground italic">Nenhuma observação registrada</p>
                                )}
                              </CardContent>
                            </Card>
                          </div>

                          {/* Timeline de Histórico */}
                          <Card>
                            <CardHeader className="pb-3">
                              <CardTitle className="text-sm font-semibold uppercase text-muted-foreground flex items-center gap-2">
                                <History className="h-4 w-4" />
                                Histórico de Ações
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              {getItemLogs(item.id).length > 0 ? (
                                <div className="space-y-3">
                                  {getItemLogs(item.id).map((log) => (
                                    <div key={log.id} className="flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0">
                                      <div className="flex-shrink-0 mt-1">
                                        <div className="h-2.5 w-2.5 rounded-full bg-primary"></div>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                          <Badge variant="outline" className="text-xs font-medium">
                                            {log.action === 'created' && 'Criado'}
                                            {log.action === 'updated' && 'Atualizado'}
                                            {log.action === 'deleted' && 'Deletado'}
                                            {log.action === 'approved' && 'Aprovado'}
                                            {log.action === 'produced' && 'Produzido'}
                                            {log.action === 'delivered' && 'Entregue'}
                                          </Badge>
                                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <User className="h-3 w-3" />
                                            {log.userName}
                                          </span>
                                          <span className="text-xs text-muted-foreground">
                                            {formatDateTime(log.createdAt)}
                                          </span>
                                        </div>
                                        {log.details && (() => {
                                          // Detectar transição de status (novo formato)
                                          const statusTransitionMatch = log.details.match(/Status alterado:\s*(.+?)\s*→\s*(.+?)(?:\s*\((.+)\)|$)/);
                                          
                                          if (statusTransitionMatch) {
                                            const [, fromStatus, toStatus, extraInfo] = statusTransitionMatch;
                                            
                                            return (
                                              <div className="flex items-center gap-2 flex-wrap text-xs">
                                                <span className="text-muted-foreground font-medium">Status:</span>
                                                <Badge variant="outline" className="bg-muted/30 text-xs">
                                                  {fromStatus.trim()}
                                                </Badge>
                                                <span className="text-primary font-bold">→</span>
                                                <Badge variant="default" className="text-xs">
                                                  {toStatus.trim()}
                                                </Badge>
                                                {extraInfo && (
                                                  <span className="text-muted-foreground italic">
                                                    ({extraInfo.trim()})
                                                  </span>
                                                )}
                                              </div>
                                            );
                                          }
                                          
                                          // Detectar formato antigo: "aprovado para produção" ou "aprovado pelo patrocinador"
                                          if (log.action === 'approved') {
                                            const approvedMatch = log.details.match(/aprovado (para produção|pelo patrocinador)/i);
                                            if (approvedMatch) {
                                              const toStatus = approvedMatch[1] === 'para produção' ? 'Pronto p/ Produção' : 'Aguardando Finalização';
                                              return (
                                                <div className="flex items-center gap-2 flex-wrap text-xs">
                                                  <span className="text-muted-foreground font-medium">Status:</span>
                                                  <Badge variant="default" className="text-xs">
                                                    {toStatus}
                                                  </Badge>
                                                </div>
                                              );
                                            }
                                          }
                                          
                                          // Detectar formato antigo: "entregue - Recebido por: X"
                                          if (log.action === 'delivered') {
                                            const deliveredMatch = log.details.match(/entregue\s*-\s*Recebido por:\s*(.+)/i);
                                            if (deliveredMatch) {
                                              const receivedBy = deliveredMatch[1].trim();
                                              return (
                                                <div className="flex items-center gap-2 flex-wrap text-xs">
                                                  <span className="text-muted-foreground font-medium">Status:</span>
                                                  <Badge variant="default" className="text-xs">
                                                    Entregue
                                                  </Badge>
                                                  <span className="text-muted-foreground italic">
                                                    (Recebido por: {receivedBy})
                                                  </span>
                                                </div>
                                              );
                                            }
                                          }
                                          
                                          return <p className="text-xs text-muted-foreground leading-relaxed">{log.details}</p>;
                                        })()}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                  <History className="h-12 w-12 mx-auto mb-2 opacity-50" />
                                  <p className="text-sm">Nenhuma ação registrada ainda</p>
                                </div>
                              )}
                            </CardContent>
                          </Card>

                          {/* Comentários */}
                          <div>
                            <CommentsSection itemId={item.id} itemType={item.type} />
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  ))}
                      </tbody>
                    </table>
                  </div>
              </CardContent>
            </Card>
          );
        })
        )}
      </div>
    </div>
  );
}
