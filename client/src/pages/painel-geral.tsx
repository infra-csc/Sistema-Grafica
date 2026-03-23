import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Calendar, User, Package2, History, MessageSquare, ExternalLink, Truck, AlertCircle } from "lucide-react";
import { useState, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
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
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#1c1917' }} data-testid="title-painel-geral">
          Painel de Status Geral
        </h1>
        <p className="text-sm mt-1" style={{ color: '#78716c' }}>
          Acompanhamento em tempo real de todos os itens em produção
        </p>
      </div>

      {/* Dashboard - 12 Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <div 
          className={`bg-[#1c1917] rounded-lg p-3 cursor-pointer hover-elevate transition-all ${statusFilter === 'all' ? 'ring-2 ring-[#f97316]' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          <div className="flex flex-row items-center justify-between pb-1 mb-2">
            <span className="text-xs font-medium text-[#a8a29e]">Total</span>
            <Package2 className="h-3.5 w-3.5 text-[#a8a29e]" />
          </div>
          <div className="text-xl font-bold text-[#f97316]" data-testid="stat-total">{stats.total}</div>
        </div>

        <Card 
          className={`cursor-pointer transition-all ${statusFilter === 'requested' ? 'ring-2 ring-[#f97316]' : ''}`}
          style={{
            backgroundColor: statusFilter === 'requested' ? '#fff5eb' : '#ffffff',
            border: '1px solid #e7e5e4',
            borderRadius: '10px'
          }}
          onClick={() => setStatusFilter(statusFilter === 'requested' ? 'all' : 'requested')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className="text-xs font-medium text-[#1c1917]">Solicitado</CardTitle>
            <div className="h-2.5 w-2.5 rounded-full bg-[#f97316]"></div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-[#f97316]">{stats.requested}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${statusFilter === 'awaiting_linking' ? 'ring-2 ring-[#f97316]' : ''}`}
          style={{
            backgroundColor: statusFilter === 'awaiting_linking' ? '#f8f7f6' : '#ffffff',
            border: '1px solid #e7e5e4',
            borderRadius: '10px'
          }}
          onClick={() => setStatusFilter(statusFilter === 'awaiting_linking' ? 'all' : 'awaiting_linking')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className="text-xs font-medium text-[#1c1917]">Aguard. Vinculação</CardTitle>
            <div className="h-2.5 w-2.5 rounded-full bg-[#a8a29e]"></div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-[#78716c]">{stats.awaitingLinking}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${statusFilter === 'awaiting_submission' ? 'ring-2 ring-[#f97316]' : ''}`}
          style={{
            backgroundColor: statusFilter === 'awaiting_submission' ? '#eff6ff' : '#ffffff',
            border: '1px solid #e7e5e4',
            borderRadius: '10px'
          }}
          onClick={() => setStatusFilter(statusFilter === 'awaiting_submission' ? 'all' : 'awaiting_submission')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className="text-xs font-medium text-[#1c1917]">Aguard. Envio</CardTitle>
            <div className="h-2.5 w-2.5 rounded-full bg-[#2563eb]"></div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-[#0ea5e9]">{stats.awaitingSubmission}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${statusFilter === 'awaiting_approval' || statusFilter === 'awaiting_sponsor_approval' ? 'ring-2 ring-[#f97316]' : ''}`}
          style={{
            backgroundColor: statusFilter === 'awaiting_approval' || statusFilter === 'awaiting_sponsor_approval' ? '#fff5eb' : '#ffffff',
            border: '1px solid #e7e5e4',
            borderRadius: '10px'
          }}
          onClick={() => setStatusFilter(statusFilter === 'awaiting_approval' || statusFilter === 'awaiting_sponsor_approval' ? 'all' : 'awaiting_approval')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className="text-xs font-medium text-[#1c1917]">Aguard. Aprovação</CardTitle>
            <div className="h-2.5 w-2.5 rounded-full bg-[#f97316]"></div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-[#f97316]">{stats.awaitingApproval}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${statusFilter === 'awaiting_finalization' || statusFilter === 'sponsor_approved' ? 'ring-2 ring-[#f97316]' : ''}`}
          style={{
            backgroundColor: statusFilter === 'awaiting_finalization' || statusFilter === 'sponsor_approved' ? '#f5f3ff' : '#ffffff',
            border: '1px solid #e7e5e4',
            borderRadius: '10px'
          }}
          onClick={() => setStatusFilter(statusFilter === 'awaiting_finalization' || statusFilter === 'sponsor_approved' ? 'all' : 'awaiting_finalization')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className="text-xs font-medium text-[#1c1917]">Aguard. Finalização</CardTitle>
            <div className="h-2.5 w-2.5 rounded-full bg-[#a855f7]"></div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-[#a855f7]">{stats.awaitingFinalization}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${statusFilter === 'awaiting_final_review' || statusFilter === 'awaiting_creator_review' ? 'ring-2 ring-[#f97316]' : ''}`}
          style={{
            backgroundColor: statusFilter === 'awaiting_final_review' || statusFilter === 'awaiting_creator_review' ? '#f3e8ff' : '#ffffff',
            border: '1px solid #e7e5e4',
            borderRadius: '10px'
          }}
          onClick={() => setStatusFilter(statusFilter === 'awaiting_final_review' || statusFilter === 'awaiting_creator_review' ? 'all' : 'awaiting_final_review')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className="text-xs font-medium text-[#1c1917]">Aguard. Revisão</CardTitle>
            <div className="h-2.5 w-2.5 rounded-full bg-[#d946ef]"></div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-[#d946ef]">{stats.awaitingFinalReview}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${statusFilter === 'ready_for_production' ? 'ring-2 ring-[#f97316]' : ''}`}
          style={{
            backgroundColor: statusFilter === 'ready_for_production' ? '#ecfdf5' : '#ffffff',
            border: '1px solid #e7e5e4',
            borderRadius: '10px'
          }}
          onClick={() => setStatusFilter(statusFilter === 'ready_for_production' ? 'all' : 'ready_for_production')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className="text-xs font-medium text-[#1c1917]">Pronto Produção</CardTitle>
            <div className="h-2.5 w-2.5 rounded-full bg-[#10b981]"></div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-[#10b981]">{stats.readyForProduction}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${statusFilter === 'approved' ? 'ring-2 ring-[#f97316]' : ''}`}
          style={{
            backgroundColor: statusFilter === 'approved' ? '#f0fdf4' : '#ffffff',
            border: '1px solid #e7e5e4',
            borderRadius: '10px'
          }}
          onClick={() => setStatusFilter(statusFilter === 'approved' ? 'all' : 'approved')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className="text-xs font-medium text-[#1c1917]">Liberado</CardTitle>
            <div className="h-2.5 w-2.5 rounded-full bg-[#15803d]"></div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-[#15803d]">{stats.approved}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${statusFilter === 'inProduction' ? 'ring-2 ring-[#f97316]' : ''}`}
          style={{
            backgroundColor: statusFilter === 'inProduction' ? '#fef3c7' : '#ffffff',
            border: '1px solid #e7e5e4',
            borderRadius: '10px'
          }}
          onClick={() => setStatusFilter(statusFilter === 'inProduction' ? 'all' : 'inProduction')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className="text-xs font-medium text-[#1c1917]">Em Produção</CardTitle>
            <div className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]"></div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-[#f59e0b]">{stats.inProduction}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${statusFilter === 'produced' ? 'ring-2 ring-[#f97316]' : ''}`}
          style={{
            backgroundColor: statusFilter === 'produced' ? '#fce7f3' : '#ffffff',
            border: '1px solid #e7e5e4',
            borderRadius: '10px'
          }}
          onClick={() => setStatusFilter(statusFilter === 'produced' ? 'all' : 'produced')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className="text-xs font-medium text-[#1c1917]">Produzido</CardTitle>
            <div className="h-2.5 w-2.5 rounded-full bg-[#ec4899]"></div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-[#ec4899]">{stats.produced}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${statusFilter === 'delivered' ? 'ring-2 ring-[#f97316]' : ''}`}
          style={{
            backgroundColor: statusFilter === 'delivered' ? '#f0fdf4' : '#ffffff',
            border: '1px solid #e7e5e4',
            borderRadius: '10px'
          }}
          onClick={() => setStatusFilter(statusFilter === 'delivered' ? 'all' : 'delivered')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className="text-xs font-medium text-[#1c1917]">Entregue</CardTitle>
            <div className="h-2.5 w-2.5 rounded-full bg-[#15803d]"></div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-[#15803d]">{stats.delivered}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div style={{ backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: '10px', padding: '1.5rem' }}>
        <h3 className="text-lg font-bold text-[#1c1917] mb-4">Filtros</h3>
        <div className="flex flex-col gap-4">
          {/* Linha 1: Busca */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[#a8a29e]" />
            <Input
              placeholder="Buscar por evento, tipo ou ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                backgroundColor: '#fafaf9',
                border: '1px solid #e7e5e4',
                color: '#1c1917',
                paddingLeft: '2.5rem',
                borderRadius: '10px'
              }}
              data-testid="input-search"
            />
          </div>
          
          {/* Linha 2: Selects */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger style={{
                backgroundColor: '#fafaf9',
                border: '1px solid #e7e5e4',
                color: '#1c1917',
                borderRadius: '10px'
              }} data-testid="select-event-filter">
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
              <SelectTrigger style={{
                backgroundColor: '#fafaf9',
                border: '1px solid #e7e5e4',
                color: '#1c1917',
                borderRadius: '10px'
              }} data-testid="select-type-filter">
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
                <SelectTrigger style={{
                  backgroundColor: '#fafaf9',
                  border: '1px solid #e7e5e4',
                  color: '#1c1917',
                  borderRadius: '10px'
                }} data-testid="select-sponsor-filter" className="text-left whitespace-normal leading-tight min-h-9">
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
              <SelectTrigger style={{
                backgroundColor: '#fafaf9',
                border: '1px solid #e7e5e4',
                color: '#1c1917'
              }} data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="awaiting_approval">Aguardando Aprovação</SelectItem>
                <SelectItem value="awaiting_finalization">Aguardando Finalização</SelectItem>
                <SelectItem value="awaiting_final_review">Aguardando Revisão Final</SelectItem>
                <SelectItem value="awaiting_linking">Aguardando Vinculação</SelectItem>
                <SelectItem value="awaiting_submission">Aguardando Envio</SelectItem>
                <SelectItem value="approved">Liberado</SelectItem>
                <SelectItem value="delivered">Entregue</SelectItem>
                <SelectItem value="inProduction">Em Produção</SelectItem>
                <SelectItem value="produced">Produzido</SelectItem>
                <SelectItem value="ready_for_production">Pronto p/ Produção</SelectItem>
                <SelectItem value="requested">Solicitado</SelectItem>
              </SelectContent>
            </Select>

            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger style={{
                backgroundColor: '#fafaf9',
                border: '1px solid #e7e5e4',
                color: '#1c1917'
              }} data-testid="select-date-filter">
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
      </div>

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
                          <Fragment key={item.id}>
                          <tr
                            className={`border-b hover-elevate cursor-pointer transition-colors ${
                              index % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                            }`}
                            onClick={() => setSelectedItem(item)}
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
                          {item.observations && (
                            <tr className="bg-amber-50/50 dark:bg-amber-950/20 border-b border-amber-200/30 dark:border-amber-900/30">
                              <td colSpan={8} className="py-2 px-4">
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
              </CardContent>
            </Card>
          );
        })
        )}
      </div>

      {/* Modal de Detalhes do Item */}
      <ItemDetailsDialog
        item={selectedItem}
        auditLogs={auditLogs}
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItem(null)}
      />
    </div>
  );
}
