import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import { Search, Bell, Calendar, AlertCircle, Filter } from "lucide-react";
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

  // Status cards config com valores e cores específicas
  const statusCards = [
    // LINHA 1
    { key: 'total', label: 'Total', color: '#1a1916', textColor: '#ffffff', dot: '#1a1916', icon: '📦' },
    { key: 'requested', label: 'Solicitado', count: statsItems.filter(i => i.status === 'requested').length, color: '#d97706', textColor: '#d97706', dot: '#d97706' },
    { key: 'awaiting_linking', label: 'Ag. Vinculação', count: statsItems.filter(i => i.status === 'awaiting_linking').length, color: '#a09d98', textColor: '#a09d98', dot: '#f59e0b' },
    { key: 'awaiting_submission', label: 'Ag. Envio', count: statsItems.filter(i => i.status === 'awaiting_submission').length, color: '#2563eb', textColor: '#2563eb', dot: '#2563eb' },
    { key: 'awaiting_approval', label: 'Ag. Aprovação', count: statsItems.filter(i => matchesStatusFilter(i, 'awaiting_approval')).length, color: '#dc2626', textColor: '#dc2626', dot: '#dc2626' },
    { key: 'awaiting_finalization', label: 'Ag. Finalização', count: statsItems.filter(i => matchesStatusFilter(i, 'awaiting_finalization')).length, color: '#a09d98', textColor: '#a09d98', dot: '#6d28d9' },
    { key: 'awaiting_final_review', label: 'Ag. Revisão', count: statsItems.filter(i => matchesStatusFilter(i, 'awaiting_final_review')).length, color: '#7c3aed', textColor: '#7c3aed', dot: '#7c3aed' },
    // LINHA 2
    { key: 'ready_for_production', label: 'Pronto Produção', count: statsItems.filter(i => i.status === 'ready_for_production').length, color: '#0891b2', textColor: '#0891b2', dot: '#0891b2' },
    { key: 'approved', label: 'Liberado', count: statsItems.filter(i => i.status === 'approved').length, color: '#16a34a', textColor: '#16a34a', dot: '#16a34a' },
    { key: 'inProduction', label: 'Em Produção', count: statsItems.filter(i => i.status === 'inProduction').length, color: '#d97706', textColor: '#d97706', dot: '#d97706' },
    { key: 'produced', label: 'Produzido', count: statsItems.filter(i => i.status === 'produced').length, color: '#9333ea', textColor: '#9333ea', dot: '#9333ea' },
    { key: 'delivered', label: 'Entregue', count: statsItems.filter(i => i.status === 'delivered').length, color: '#15803d', textColor: '#15803d', dot: '#15803d' },
  ];

  const getStatusBadgeStyle = (status: string) => {
    const styles: Record<string, {bg: string, border: string, text: string, dot: string}> = {
      'requested': { bg: '#fffbeb', border: '#fde68a', text: '#d97706', dot: '#d97706' },
      'awaiting_final_review': { bg: '#f5f3ff', border: '#ddd6fe', text: '#7c3aed', dot: '#7c3aed' },
      'awaiting_approval': { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', dot: '#dc2626' },
      'awaiting_sponsor_approval': { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', dot: '#dc2626' },
      'ready_for_production': { bg: '#ecfeff', border: '#a5f3fc', text: '#0891b2', dot: '#0891b2' },
      'approved': { bg: '#f0fdf4', border: '#bbf7d0', text: '#16a34a', dot: '#16a34a' },
      'inProduction': { bg: '#fff7ed', border: '#fed7aa', text: '#d97706', dot: '#d97706' },
      'produced': { bg: '#faf5ff', border: '#e9d5ff', text: '#9333ea', dot: '#9333ea' },
      'delivered': { bg: '#f0fdf4', border: '#86efac', text: '#15803d', dot: '#15803d' },
      'sponsor_approved': { bg: '#ecfeff', border: '#a5f3fc', text: '#0891b2', dot: '#0891b2' },
      'awaiting_finalization': { bg: '#ecfeff', border: '#a5f3fc', text: '#0891b2', dot: '#0891b2' },
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
    <div className="min-h-screen bg-[#f4f3f0] flex flex-col">
      {/* TOPBAR */}
      <div className="bg-white border-b border-[#e8e5df] sticky top-0 z-40">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 bg-black rounded-full"></div>
            <span className="font-bold text-base text-[#1a1916]">Gestão de Materiais</span>
          </div>
          
          <div className="flex items-center gap-5">
            <button className="relative p-2 hover:bg-[#faf9f7] rounded-lg transition-colors">
              <Bell className="h-5 w-5 text-[#1a1916]" />
              <span className="absolute top-0 right-0 w-5 h-5 bg-red-600 rounded-full flex items-center justify-center text-white font-bold text-xs">9+</span>
            </button>
            
            <div className="flex items-center gap-2.5 cursor-pointer hover:bg-[#faf9f7] px-3 py-2 rounded-lg transition-colors">
              <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white font-bold text-sm">A</div>
              <span className="text-sm font-medium text-[#1a1916]">Administrador</span>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 px-6 py-6 space-y-6 overflow-auto">
        {/* STATUS CARDS - 2 linhas de 7 cards */}
        <div className="space-y-3 animate-fadeUp">
          {/* Linha 1 */}
          <div className="grid grid-cols-7 gap-3">
            {statusCards.slice(0, 7).map((card, idx) => (
              <div
                key={card.key}
                onClick={() => card.key !== 'total' && setStatusFilter(card.key)}
                className={`relative bg-white rounded-[12px] p-4 border border-[#e8e5df] cursor-pointer transition-all hover:translate-y-[-1px] hover:shadow-sm ${
                  card.key === 'total' ? 'bg-[#1a1916] text-white' : ''
                }`}
              >
                {/* Dot colorido no canto superior direito */}
                <div 
                  className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: card.dot || card.color }}
                ></div>
                
                <div className="text-[11.5px] font-medium text-[#6b6760] mb-1.5" style={card.key === 'total' ? {color: 'rgba(255,255,255,0.7)'} : {}}>
                  {card.label}
                </div>
                <div 
                  className="text-2xl font-bold font-mono"
                  style={{color: card.key === 'total' ? '#ffffff' : card.textColor}}
                >
                  {card.key === 'total' ? statsItems.length : card.count}
                </div>
              </div>
            ))}
          </div>

          {/* Linha 2 */}
          <div className="grid grid-cols-7 gap-3">
            {statusCards.slice(7).map((card) => (
              <div
                key={card.key}
                onClick={() => setStatusFilter(card.key)}
                className={`relative bg-white rounded-[12px] p-4 border border-[#e8e5df] cursor-pointer transition-all hover:translate-y-[-1px] hover:shadow-sm`}
              >
                {/* Dot colorido no canto superior direito */}
                <div 
                  className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: card.dot || card.color }}
                ></div>
                
                <div className="text-[11.5px] font-medium text-[#6b6760] mb-1.5">
                  {card.label}
                </div>
                <div 
                  className="text-2xl font-bold font-mono"
                  style={{color: card.textColor}}
                >
                  {card.count}
                </div>
              </div>
            ))}
            {/* 2 cards invisíveis para manter grid alinhado */}
            <div className="opacity-0 pointer-events-none"></div>
            <div className="opacity-0 pointer-events-none"></div>
          </div>
        </div>

        {/* FILTERS */}
        <Card className="border-[#e8e5df] animate-fadeUp">
          <CardContent className="p-4">
            {/* Linha 1: Search + Filtros */}
            <div className="flex gap-3 mb-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[#a09d98]" />
                <Input
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 border-[#e8e5df] bg-white text-[#1a1916]"
                  data-testid="input-search"
                />
              </div>
              <Button variant="outline" size="sm" className="border-[#e8e5df] text-[#1a1916]">
                <Filter className="h-4 w-4 mr-2" />
                Filtros
              </Button>
            </div>

            {/* Linha 2: Selects */}
            <div className="grid grid-cols-5 gap-3">
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger className="bg-white border-[#e8e5df] text-[#1a1916]" data-testid="select-event-filter">
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
                <SelectTrigger className="bg-white border-[#e8e5df] text-[#1a1916]" data-testid="select-type-filter">
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
                <SelectTrigger className="bg-white border-[#e8e5df] text-[#1a1916]" data-testid="select-sponsor-filter">
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
                <SelectTrigger className="bg-white border-[#e8e5df] text-[#1a1916]" data-testid="select-status-filter">
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
                <SelectTrigger className="bg-white border-[#e8e5df] text-[#1a1916]" data-testid="select-date-filter">
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

        {/* ITEMS BY EVENT */}
        <div className="space-y-4 animate-fadeUp">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredItems.length === 0 ? (
            <Card className="border-[#e8e5df]">
              <CardContent className="text-center py-12">
                <AlertCircle className="h-12 w-12 text-[#d1ccc4] mx-auto mb-4" />
                <p className="text-[#6b6760] font-medium">Nenhum item encontrado</p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(itemsByEvent).map(([eventId, eventItems]) => {
              const event = events.find(e => e.id === eventId);
              return (
                <Card key={eventId} className="border-[#e8e5df] overflow-hidden">
                  {/* EVENT HEADER */}
                  <div className="bg-white px-6 py-4 border-b border-[#e8e5df] flex items-center gap-3">
                    <div className="w-9 h-9 bg-black rounded-[9px] flex items-center justify-center text-white text-sm">
                      📅
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-base text-[#1a1916]">{event?.name || 'Sem Evento'}</h3>
                      <div className="text-xs text-[#6b6760] mt-1 space-y-0.5">
                        {event?.startDate && (
                          <div>📅 Evento: {format(new Date(event.startDate), "dd/MM/yyyy", { locale: ptBR })}</div>
                        )}
                        {event?.truckDepartureDate && (
                          <div>🚛 Saída caminhão: {format(new Date(event.truckDepartureDate), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</div>
                        )}
                      </div>
                    </div>
                    <Badge className="ml-auto bg-[#f9f8f7] text-[#1a1916] font-mono border border-[#e8e5df]">
                      {eventItems.length} itens
                    </Badge>
                  </div>

                  {/* TABLE */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[#faf9f7] border-b border-[#e8e5df]">
                        <tr>
                          <th className="text-left px-4 py-2.5 font-semibold text-[#6b6760] text-xs uppercase tracking-[0.6px]">ID</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-[#6b6760] text-xs uppercase tracking-[0.6px]">Tipo</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-[#6b6760] text-xs uppercase tracking-[0.6px]">Descrição</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-[#6b6760] text-xs uppercase tracking-[0.6px]">Arquivo</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-[#6b6760] text-xs uppercase tracking-[0.6px]">Visual</th>
                          <th className="text-center px-4 py-2.5 font-semibold text-[#6b6760] text-xs uppercase tracking-[0.6px]">Qtd</th>
                          <th className="text-right px-4 py-2.5 font-semibold text-[#6b6760] text-xs uppercase tracking-[0.6px]">m²</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-[#6b6760] text-xs uppercase tracking-[0.6px]">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eventItems.map((item) => {
                          const badgeStyle = getStatusBadgeStyle(item.status);
                          const m2 = item.m2Total ? parseFloat(item.m2Total) : 0;
                          return (
                            <Fragment key={item.id}>
                              <tr 
                                className="border-b border-[#e8e5df] hover:bg-[#faf9f7] cursor-pointer transition-colors"
                                onClick={() => setSelectedItem(item)}
                                data-testid={`row-item-${item.id}`}
                              >
                                <td className="px-4 py-3">
                                  <code className="bg-[#f4f3f0] px-2 py-1 rounded-[6px] text-xs font-mono font-semibold text-[#1a1916] border border-[#e8e5df]">
                                    {item.displayId || item.id}
                                  </code>
                                </td>
                                <td className="px-4 py-3">
                                  <Badge variant="outline" className="border-[#e8e5df] bg-[#f9f8f7] text-[#1a1916]">
                                    {item.type}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-[#1a1916]">{item.description || item.name || '—'}</td>
                                <td className="px-4 py-3 font-mono text-xs text-[#6b6760]">
                                  {item.fileWidth && item.fileHeight ? `${item.fileWidth}×${item.fileHeight}m` : '—'}
                                </td>
                                <td className="px-4 py-3 font-mono text-xs text-[#6b6760]">
                                  {item.visualWidth && item.visualHeight ? `${item.visualWidth}×${item.visualHeight}m` : '—'}
                                </td>
                                <td className="px-4 py-3 text-center text-[#6b6760]">{item.quantity || '—'}</td>
                                <td className="px-4 py-3 text-right">
                                  <span className="font-bold font-mono" style={m2 > 100 ? {color: '#dc2626'} : {color: '#1a1916'}}>
                                    {m2.toFixed(2)}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div 
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold"
                                    style={{
                                      backgroundColor: badgeStyle.bg,
                                      borderColor: badgeStyle.border,
                                      color: badgeStyle.text
                                    }}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: badgeStyle.dot}}></span>
                                    {getStatusLabel(item.status)}
                                  </div>
                                </td>
                              </tr>
                              {item.observations && (
                                <tr className="bg-amber-50/40 border-b border-[#e8e5df]">
                                  <td colSpan={8} className="px-4 py-3">
                                    <div className="flex gap-2 items-start">
                                      <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                                      <div className="text-xs text-amber-800">
                                        <span className="font-semibold">Observações:</span> {item.observations}
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
    </div>
  );
}
