import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import { Search, Calendar, AlertCircle, Filter, Grid3X3 } from "lucide-react";
import { useState, Fragment, useMemo } from "react";
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

  const uniqueTypes = useMemo(() => 
    Array.from(new Set(items.map(item => item.type))).sort(), 
    [items]
  );

  const applyBaseFilters = (item: any) => {
    const matchesSearch = 
      item.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.event?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.displayId?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEvent = eventFilter === "all" || item.eventId === eventFilter;
    const matchesType = typeFilter === "all" || item.type === typeFilter;
    
    const matchesSponsor = sponsorFilter === "all" || 
      (item.sponsors && Array.isArray(item.sponsors) && item.sponsors.some((s: any) => s.id === sponsorFilter));
    
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

  const statsItems = items.filter(applyBaseFilters);

  const matchesStatusFilter = (item: any, filter: string) => {
    if (filter === "all") return true;
    
    const statusMap: Record<string, string[]> = {
      'awaiting_approval': ['awaiting_approval', 'awaiting_sponsor_approval'],
      'awaiting_finalization': ['awaiting_finalization', 'sponsor_approved'],
      'awaiting_final_review': ['awaiting_final_review', 'awaiting_creator_review'],
    };
    
    if (statusMap[filter]) {
      return statusMap[filter].includes(item.status);
    }
    return item.status === filter;
  };

  const filteredItems = statsItems.filter(item => matchesStatusFilter(item, statusFilter));

  const statusCards = [
    { key: 'total', label: 'Total', count: statsItems.length, isTotal: true, textColor: '#06b6d4' },
    { key: 'requested', label: 'Solicitado', count: statsItems.filter(i => i.status === 'requested').length, textColor: '#d97706', dot: '#d97706' },
    { key: 'awaiting_linking', label: 'Ag. Vinculação', count: statsItems.filter(i => i.status === 'awaiting_linking').length, textColor: '#9ca3af', dot: '#9ca3af' },
    { key: 'awaiting_submission', label: 'Ag. Envio', count: statsItems.filter(i => i.status === 'awaiting_submission').length, textColor: '#06b6d4', dot: '#06b6d4' },
    { key: 'awaiting_approval', label: 'Ag. Aprovação', count: statsItems.filter(i => matchesStatusFilter(i, 'awaiting_approval')).length, textColor: '#dc2626', dot: '#dc2626' },
    { key: 'awaiting_finalization', label: 'Ag. Finalização', count: statsItems.filter(i => matchesStatusFilter(i, 'awaiting_finalization')).length, textColor: '#9ca3af', dot: '#6d28d9' },
    { key: 'awaiting_final_review', label: 'Ag. Revisão', count: statsItems.filter(i => matchesStatusFilter(i, 'awaiting_final_review')).length, textColor: '#7c3aed', dot: '#7c3aed' },
    // Linha 2
    { key: 'ready_for_production', label: 'Pronto Produção', count: statsItems.filter(i => i.status === 'ready_for_production').length, textColor: '#06b6d4', dot: '#06b6d4' },
    { key: 'approved', label: 'Liberado', count: statsItems.filter(i => i.status === 'approved').length, textColor: '#84cc16', dot: '#84cc16' },
    { key: 'inProduction', label: 'Em Produção', count: statsItems.filter(i => i.status === 'inProduction').length, textColor: '#d97706', dot: '#d97706' },
    { key: 'produced', label: 'Produzido', count: statsItems.filter(i => i.status === 'produced').length, textColor: '#9333ea', dot: '#9333ea' },
    { key: 'delivered', label: 'Entregue', count: statsItems.filter(i => i.status === 'delivered').length, textColor: '#15803d', dot: '#15803d' },
  ];

  const getStatusBadgeStyle = (status: string) => {
    const styles: Record<string, {bg: string, border: string, text: string, dot: string}> = {
      'requested': { bg: '#fffbeb', border: '#fde68a', text: '#d97706', dot: '#d97706' },
      'awaiting_final_review': { bg: '#f5f3ff', border: '#ddd6fe', text: '#7c3aed', dot: '#7c3aed' },
      'awaiting_approval': { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', dot: '#dc2626' },
      'awaiting_sponsor_approval': { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', dot: '#dc2626' },
      'awaiting_submission': { bg: '#eff6ff', border: '#bfdbfe', text: '#2563eb', dot: '#2563eb' },
      'ready_for_production': { bg: '#ecfeff', border: '#a5f3fc', text: '#06b6d4', dot: '#06b6d4' },
      'approved': { bg: '#f7fee7', border: '#d9f99d', text: '#65a30d', dot: '#84cc16' },
      'inProduction': { bg: '#fff7ed', border: '#fed7aa', text: '#d97706', dot: '#d97706' },
      'produced': { bg: '#faf5ff', border: '#e9d5ff', text: '#9333ea', dot: '#9333ea' },
      'delivered': { bg: '#f0fdf4', border: '#86efac', text: '#15803d', dot: '#15803d' },
      'sponsor_approved': { bg: '#ecfeff', border: '#a5f3fc', text: '#06b6d4', dot: '#06b6d4' },
      'awaiting_finalization': { bg: '#ecfeff', border: '#a5f3fc', text: '#06b6d4', dot: '#06b6d4' },
      'awaiting_creator_review': { bg: '#f5f3ff', border: '#ddd6fe', text: '#7c3aed', dot: '#7c3aed' },
    };
    return styles[status] || { bg: '#f9f8f7', border: '#e8e5df', text: '#a09d98', dot: '#a09d98' };
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'requested': 'Solicitado',
      'awaiting_linking': 'Ag. Vinculação',
      'awaiting_submission': 'Ag. Envio',
      'awaiting_sponsor_approval': 'Ag. Aprovação',
      'awaiting_approval': 'Ag. Aprovação',
      'sponsor_approved': 'Ag. Finalização',
      'awaiting_creator_review': 'Ag. Revisão Final',
      'awaiting_finalization': 'Ag. Finalização',
      'awaiting_final_review': 'Ag. Revisão Final',
      'ready_for_production': 'Pronto p/ Produção',
      'approved': 'Liberado',
      'inProduction': 'Em Produção',
      'produced': 'Produzido',
      'delivered': 'Entregue',
    };
    return labels[status] || status;
  };

  const itemsByEvent = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    filteredItems.forEach(item => {
      if (!grouped[item.eventId]) {
        grouped[item.eventId] = [];
      }
      grouped[item.eventId].push(item);
    });
    return grouped;
  }, [filteredItems]);

  return (
    <div className="min-h-screen bg-[#f1f5f9]">
      <div className="px-6 py-6 space-y-5 overflow-auto max-w-full">
        {/* STATUS CARDS - 2 linhas */}
        <div className="space-y-3" style={{ animation: 'fadeUp 0.3s ease' }}>
          {/* Linha 1 - 7 cards */}
          <div className="grid grid-cols-7 gap-3">
            {statusCards.slice(0, 7).map((card) => (
              <div
                key={card.key}
                className="relative transition-all duration-200"
                style={{
                  backgroundColor: card.isTotal ? '#2d2d2d' : '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '16px',
                  cursor: 'pointer'
                }}
                onClick={() => setStatusFilter(card.key === 'total' ? 'all' : card.key)}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)';
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                }}
              >
                {!card.isTotal && card.dot && (
                  <div 
                    className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: card.dot }}
                  ></div>
                )}
                <div 
                  className="text-xs uppercase"
                  style={{
                    color: card.isTotal ? 'rgba(255,255,255,0.65)' : '#6b7280',
                    letterSpacing: '0.5px',
                    marginBottom: '8px',
                    fontWeight: 600
                  }}
                >
                  {card.label}
                </div>
                <div 
                  className="font-black"
                  style={{
                    fontSize: '26px',
                    color: card.textColor,
                    fontWeight: 800
                  }}
                >
                  {card.count}
                </div>
              </div>
            ))}
          </div>

          {/* Linha 2 - 5 cards + 2 vazios */}
          <div className="grid grid-cols-7 gap-3">
            {statusCards.slice(7).map((card) => (
              <div
                key={card.key}
                className="relative transition-all duration-200"
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '16px',
                  cursor: 'pointer'
                }}
                onClick={() => setStatusFilter(card.key)}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)';
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                }}
              >
                {card.dot && (
                  <div 
                    className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: card.dot }}
                  ></div>
                )}
                <div 
                  className="text-xs uppercase"
                  style={{
                    color: '#6b7280',
                    letterSpacing: '0.5px',
                    marginBottom: '8px',
                    fontWeight: 600
                  }}
                >
                  {card.label}
                </div>
                <div 
                  className="font-black"
                  style={{
                    fontSize: '26px',
                    color: card.textColor,
                    fontWeight: 800
                  }}
                >
                  {card.count}
                </div>
              </div>
            ))}
            {/* 2 cells vazios */}
            <div></div>
            <div></div>
          </div>
        </div>

        {/* FILTROS */}
        <Card style={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: '12px' }}>
          <CardContent className="p-4">
            {/* Linha 1: Search + Filtros */}
            <div className="flex gap-3 mb-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
                <Input
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    paddingLeft: '40px',
                    backgroundColor: '#f1f5f9',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '13px'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#06b6d4';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(6, 182, 212, 0.15)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  data-testid="input-search"
                />
              </div>
              <Button 
                size="sm"
                style={{
                  backgroundColor: '#2d2d2d',
                  color: 'white',
                  borderRadius: '8px'
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#06b6d4';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#2d2d2d';
                }}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filtros
              </Button>
            </div>

            {/* Linha 2: Selects */}
            <div className="grid grid-cols-5 gap-3">
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger 
                  style={{
                    backgroundColor: '#f1f5f9',
                    borderColor: '#e5e7eb',
                    borderRadius: '8px',
                    height: '38px',
                    fontSize: '13px'
                  }}
                  data-testid="select-event-filter"
                >
                  <SelectValue placeholder="Todos os eventos" />
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
                <SelectTrigger 
                  style={{
                    backgroundColor: '#f1f5f9',
                    borderColor: '#e5e7eb',
                    borderRadius: '8px',
                    height: '38px',
                    fontSize: '13px'
                  }}
                  data-testid="select-type-filter"
                >
                  <SelectValue placeholder="Todos os tipos" />
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

              <Select value={sponsorFilter} onValueChange={setSponsorFilter}>
                <SelectTrigger 
                  style={{
                    backgroundColor: '#f1f5f9',
                    borderColor: '#e5e7eb',
                    borderRadius: '8px',
                    height: '38px',
                    fontSize: '13px'
                  }}
                  data-testid="select-sponsor-filter"
                >
                  <SelectValue placeholder="Todos os patrocinadores" />
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

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger 
                  style={{
                    backgroundColor: '#f1f5f9',
                    borderColor: '#e5e7eb',
                    borderRadius: '8px',
                    height: '38px',
                    fontSize: '13px'
                  }}
                  data-testid="select-status-filter"
                >
                  <SelectValue placeholder="Todos os status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="requested">Solicitado</SelectItem>
                  <SelectItem value="awaiting_approval">Ag. Aprovação</SelectItem>
                  <SelectItem value="awaiting_final_review">Ag. Revisão Final</SelectItem>
                  <SelectItem value="awaiting_finalization">Ag. Finalização</SelectItem>
                  <SelectItem value="awaiting_linking">Ag. Vinculação</SelectItem>
                  <SelectItem value="awaiting_submission">Ag. Envio</SelectItem>
                  <SelectItem value="approved">Liberado</SelectItem>
                  <SelectItem value="delivered">Entregue</SelectItem>
                  <SelectItem value="inProduction">Em Produção</SelectItem>
                  <SelectItem value="produced">Produzido</SelectItem>
                  <SelectItem value="ready_for_production">Pronto p/ Produção</SelectItem>
                </SelectContent>
              </Select>

              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger 
                  style={{
                    backgroundColor: '#f1f5f9',
                    borderColor: '#e5e7eb',
                    borderRadius: '8px',
                    height: '38px',
                    fontSize: '13px'
                  }}
                  data-testid="select-date-filter"
                >
                  <SelectValue placeholder="Todas as datas" />
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
          </CardContent>
        </Card>

        {/* GRUPOS DE EVENTO */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#06b6d4]"></div>
            </div>
          ) : filteredItems.length === 0 ? (
            <Card style={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: '14px' }}>
              <CardContent className="text-center py-12">
                <AlertCircle className="h-12 w-12 text-[#d1d5db] mx-auto mb-4" />
                <p className="text-[#6b7280] font-medium">Nenhum item encontrado</p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(itemsByEvent).map(([eventId, eventItems]) => {
              const event = events.find(e => e.id === eventId);
              return (
                <Card 
                  key={eventId} 
                  className="overflow-hidden"
                  style={{
                    backgroundColor: '#ffffff',
                    borderColor: '#e5e7eb',
                    borderRadius: '14px',
                    animation: 'fadeUp 0.3s ease'
                  }}
                >
                  {/* EVENT HEADER */}
                  <div 
                    style={{
                      backgroundColor: '#ffffff',
                      padding: '16px 24px',
                      borderBottom: '1px solid #f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}
                  >
                    <div 
                      style={{
                        width: '36px',
                        height: '36px',
                        backgroundColor: '#06b6d4',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '18px',
                        flexShrink: 0
                      }}
                    >
                      📅
                    </div>
                    <div className="flex-1">
                      <h3 style={{ color: '#2d2d2d', fontWeight: 700, fontSize: '15px' }}>
                        {event?.name || 'Sem Evento'}
                      </h3>
                      <div style={{ color: '#9ca3af', fontSize: '12px', marginTop: '4px', lineHeight: '1.4' }}>
                        {event?.startDate && (
                          <div>📅 Evento: {format(new Date(event.startDate), "dd/MM/yyyy", { locale: ptBR })}</div>
                        )}
                        {event?.truckDepartureDate && (
                          <div>🚛 Saída caminhão: {format(new Date(event.truckDepartureDate), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</div>
                        )}
                      </div>
                    </div>
                    <Badge 
                      style={{
                        backgroundColor: '#f1f5f9',
                        color: '#2d2d2d',
                        borderColor: '#e5e7eb',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        borderRadius: '100px'
                      }}
                      className="border"
                    >
                      {eventItems.length} itens
                    </Badge>
                  </div>

                  {/* TABLE */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                          <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.6px' }}>ID</th>
                          <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Tipo</th>
                          <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Descrição</th>
                          <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Arquivo</th>
                          <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Visual</th>
                          <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600, fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Qtd</th>
                          <th style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 600, fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.6px' }}>m²</th>
                          <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eventItems.map((item, idx) => {
                          const badgeStyle = getStatusBadgeStyle(item.status);
                          const m2 = item.m2Total ? parseFloat(item.m2Total) : 0;
                          return (
                            <Fragment key={item.id}>
                              <tr 
                                style={{
                                  borderBottom: idx === eventItems.length - 1 ? 'none' : '1px solid #f1f5f9',
                                  cursor: 'pointer',
                                  transition: 'background-color 0.15s'
                                }}
                                onClick={() => setSelectedItem(item)}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '#f8fafc';
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'transparent';
                                }}
                                data-testid={`row-item-${item.id}`}
                              >
                                <td style={{ padding: '12px 16px' }}>
                                  <code style={{
                                    backgroundColor: '#f1f5f9',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    fontFamily: 'monospace',
                                    fontWeight: 600,
                                    color: '#2d2d2d',
                                    display: 'inline-block'
                                  }}>
                                    {item.displayId || item.id}
                                  </code>
                                </td>
                                <td style={{ padding: '12px 16px' }}>
                                  <Badge 
                                    style={{
                                      backgroundColor: '#f1f5f9',
                                      borderColor: '#e5e7eb',
                                      color: '#2d2d2d',
                                      fontSize: '12px',
                                      borderRadius: '6px'
                                    }}
                                    className="border"
                                  >
                                    {item.type}
                                  </Badge>
                                </td>
                                <td style={{ padding: '12px 16px', color: '#2d2d2d' }}>
                                  {item.description || item.name || '—'}
                                </td>
                                <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '12px', color: '#6b7280' }}>
                                  {item.fileWidth && item.fileHeight ? `${item.fileWidth}×${item.fileHeight}m` : '—'}
                                </td>
                                <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '12px', color: '#6b7280' }}>
                                  {item.visualWidth && item.visualHeight ? `${item.visualWidth}×${item.visualHeight}m` : '—'}
                                </td>
                                <td style={{ padding: '12px 16px', textAlign: 'center', color: '#6b7280' }}>
                                  {item.quantity || '—'}
                                </td>
                                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                  <span 
                                    style={{
                                      fontFamily: 'monospace',
                                      fontWeight: 700,
                                      color: m2 > 10 ? '#dc2626' : (m2 === 0 ? '#9ca3af' : '#2d2d2d')
                                    }}
                                  >
                                    {m2.toFixed(2)}
                                  </span>
                                </td>
                                <td style={{ padding: '12px 16px' }}>
                                  <div 
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      paddingLeft: '10px',
                                      paddingRight: '10px',
                                      paddingTop: '4px',
                                      paddingBottom: '4px',
                                      borderRadius: '100px',
                                      border: `1px solid ${badgeStyle.border}`,
                                      backgroundColor: badgeStyle.bg,
                                      fontSize: '11.5px',
                                      fontWeight: 600,
                                      color: badgeStyle.text
                                    }}
                                  >
                                    <span 
                                      style={{
                                        width: '5px',
                                        height: '5px',
                                        borderRadius: '50%',
                                        backgroundColor: badgeStyle.dot,
                                        flexShrink: 0
                                      }}
                                    ></span>
                                    {getStatusLabel(item.status)}
                                  </div>
                                </td>
                              </tr>
                              {item.observations && (
                                <tr style={{ backgroundColor: 'rgba(248, 113, 113, 0.05)', borderBottom: '1px solid #e5e7eb' }}>
                                  <td colSpan={8} style={{ padding: '12px 16px' }}>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                      <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                                      <div style={{ fontSize: '12px', color: '#b45309' }}>
                                        <span style={{ fontWeight: 600 }}>Observações:</span> {item.observations}
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
                </Card>
              );
            })
          )}
        </div>
      </div>

      <ItemDetailsDialog
        item={selectedItem}
        auditLogs={auditLogs}
        open={!!selectedItem}
        onOpenChange={(open) => {
          if (!open) setSelectedItem(null);
        }}
      />

      <style>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
