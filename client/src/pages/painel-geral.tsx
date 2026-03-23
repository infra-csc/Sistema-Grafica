import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import { Search, Calendar, Bell, Square, AlertCircle, Filter } from "lucide-react";
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

  // Pegar tipos únicos dos itens
  const uniqueTypes = useMemo(() => 
    Array.from(new Set(items.map(item => item.type))).sort(), 
    [items]
  );

  // Função auxiliar para aplicar filtros (exceto status)
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

  // Calcular stats
  const statusCounts = {
    total: statsItems.length,
    requested: statsItems.filter(i => i.status === 'requested').length,
    awaiting_linking: statsItems.filter(i => i.status === 'awaiting_linking').length,
    awaiting_submission: statsItems.filter(i => i.status === 'awaiting_submission').length,
    awaiting_approval: statsItems.filter(i => matchesStatusFilter(i, 'awaiting_approval')).length,
    awaiting_finalization: statsItems.filter(i => matchesStatusFilter(i, 'awaiting_finalization')).length,
    ready_for_production: statsItems.filter(i => i.status === 'ready_for_production').length,
    approved: statsItems.filter(i => i.status === 'approved').length,
    inProduction: statsItems.filter(i => i.status === 'inProduction').length,
    produced: statsItems.filter(i => i.status === 'produced').length,
    delivered: statsItems.filter(i => i.status === 'delivered').length,
  };

  // Agrupar itens por evento
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

  const statusConfig: Record<string, any> = {
    total: { label: 'Total', color: 'bg-slate-900 text-white', textColor: 'text-white' },
    requested: { label: 'Solicitado', color: 'bg-white text-yellow-600', textColor: 'text-yellow-600' },
    awaiting_linking: { label: 'Ag. Vinculação', color: 'bg-white text-purple-600', textColor: 'text-purple-600' },
    awaiting_submission: { label: 'Ag. Envio', color: 'bg-white text-orange-600', textColor: 'text-orange-600' },
    awaiting_approval: { label: 'Ag. Aprovação', color: 'bg-white text-red-600', textColor: 'text-red-600' },
    awaiting_finalization: { label: 'Ag. Finalização', color: 'bg-white text-cyan-600', textColor: 'text-cyan-600' },
    ready_for_production: { label: 'Pronto', color: 'bg-white text-emerald-600', textColor: 'text-emerald-600' },
    approved: { label: 'Liberado', color: 'bg-white text-green-600', textColor: 'text-green-600' },
    inProduction: { label: 'Produção', color: 'bg-white text-blue-600', textColor: 'text-blue-600' },
    produced: { label: 'Produzido', color: 'bg-white text-teal-600', textColor: 'text-teal-600' },
    delivered: { label: 'Entregue', color: 'bg-white text-emerald-700', textColor: 'text-emerald-700' },
  };

  const getItemStatusBadgeColor = (status: string) => {
    const statusColorMap: Record<string, {bg: string, border: string, dot: string}> = {
      'requested': { bg: 'bg-yellow-50', border: 'border-yellow-200', dot: 'bg-yellow-400' },
      'awaiting_linking': { bg: 'bg-purple-50', border: 'border-purple-200', dot: 'bg-purple-400' },
      'awaiting_submission': { bg: 'bg-orange-50', border: 'border-orange-200', dot: 'bg-orange-400' },
      'awaiting_sponsor_approval': { bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-400' },
      'awaiting_approval': { bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-400' },
      'sponsor_approved': { bg: 'bg-cyan-50', border: 'border-cyan-200', dot: 'bg-cyan-400' },
      'awaiting_creator_review': { bg: 'bg-cyan-50', border: 'border-cyan-200', dot: 'bg-cyan-400' },
      'awaiting_finalization': { bg: 'bg-cyan-50', border: 'border-cyan-200', dot: 'bg-cyan-400' },
      'awaiting_final_review': { bg: 'bg-cyan-50', border: 'border-cyan-200', dot: 'bg-cyan-400' },
      'ready_for_production': { bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-400' },
      'approved': { bg: 'bg-green-50', border: 'border-green-300', dot: 'bg-green-500' },
      'inProduction': { bg: 'bg-blue-50', border: 'border-blue-200', dot: 'bg-blue-400' },
      'produced': { bg: 'bg-teal-50', border: 'border-teal-200', dot: 'bg-teal-400' },
      'delivered': { bg: 'bg-emerald-100', border: 'border-emerald-400', dot: 'bg-emerald-600' },
    };
    return statusColorMap[status] || { bg: 'bg-gray-50', border: 'border-gray-200', dot: 'bg-gray-400' };
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f4f3f0] to-[#faf9f7] flex flex-col">
      {/* TOPBAR */}
      <div className="bg-white border-b border-[#e8e5df] sticky top-0 z-40">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">GD</span>
            </div>
            <span className="font-bold text-base">Gestão de Materiais</span>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="relative p-2 hover-elevate rounded-lg">
              <Bell className="h-5 w-5 text-slate-600" />
              <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full"></span>
            </button>
            
            <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center text-white font-semibold text-sm cursor-pointer hover-elevate">
              U
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 px-6 py-6 space-y-6 overflow-auto">
        {/* STATUS CARDS - 2 linhas de 7 cards */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-700">Status de Produção</h2>
          
          {/* Linha 1: Total + 3 cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Card Total - destaque */}
            <div 
              onClick={() => setStatusFilter('all')}
              className={`rounded-lg p-4 text-white cursor-pointer transition-all hover:translate-y-[-2px] hover:shadow-lg ${
                statusFilter === 'all' 
                  ? 'bg-slate-900 shadow-lg' 
                  : 'bg-slate-800'
              }`}
            >
              <div className="text-xs font-medium opacity-80 mb-1">{statusConfig.total.label}</div>
              <div className="text-3xl font-bold">{statusCounts.total}</div>
              <div className="text-xs opacity-60 mt-2">Total de itens</div>
            </div>

            {/* Cards Solicitado, Vinculação, Envio */}
            {[
              { key: 'requested', count: statusCounts.requested },
              { key: 'awaiting_linking', count: statusCounts.awaiting_linking },
              { key: 'awaiting_submission', count: statusCounts.awaiting_submission },
            ].map(item => (
              <div 
                key={item.key}
                onClick={() => setStatusFilter(item.key)}
                className={`rounded-lg p-4 border cursor-pointer transition-all hover:translate-y-[-2px] ${
                  statusFilter === item.key
                    ? 'border-current shadow-md bg-slate-50'
                    : 'border-[#e8e5df] bg-white'
                }`}
              >
                <div className="text-xs font-medium text-slate-600 mb-1">{statusConfig[item.key as keyof typeof statusConfig].label}</div>
                <div className={`text-2xl font-bold ${statusConfig[item.key as keyof typeof statusConfig].textColor}`}>
                  {item.count}
                </div>
              </div>
            ))}
          </div>

          {/* Linha 2: Aprovação, Finalização, Pronto */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {[
              { key: 'awaiting_approval', count: statusCounts.awaiting_approval },
              { key: 'awaiting_finalization', count: statusCounts.awaiting_finalization },
              { key: 'ready_for_production', count: statusCounts.ready_for_production },
              { key: 'approved', count: statusCounts.approved },
            ].map(item => (
              <div 
                key={item.key}
                onClick={() => setStatusFilter(item.key)}
                className={`rounded-lg p-4 border cursor-pointer transition-all hover:translate-y-[-2px] ${
                  statusFilter === item.key
                    ? 'border-current shadow-md bg-slate-50'
                    : 'border-[#e8e5df] bg-white'
                }`}
              >
                <div className="text-xs font-medium text-slate-600 mb-1">{statusConfig[item.key as keyof typeof statusConfig].label}</div>
                <div className={`text-2xl font-bold ${statusConfig[item.key as keyof typeof statusConfig].textColor}`}>
                  {item.count}
                </div>
              </div>
            ))}
          </div>

          {/* Linha 3: Em Produção, Produzido, Entregue */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {[
              { key: 'inProduction', count: statusCounts.inProduction },
              { key: 'produced', count: statusCounts.produced },
              { key: 'delivered', count: statusCounts.delivered },
              { key: 'empty', count: 0 }, // espaço vazio
            ].map(item => (
              item.key === 'empty' ? (
                <div key="empty"></div>
              ) : (
                <div 
                  key={item.key}
                  onClick={() => setStatusFilter(item.key)}
                  className={`rounded-lg p-4 border cursor-pointer transition-all hover:translate-y-[-2px] ${
                    statusFilter === item.key
                      ? 'border-current shadow-md bg-slate-50'
                      : 'border-[#e8e5df] bg-white'
                  }`}
                >
                  <div className="text-xs font-medium text-slate-600 mb-1">{statusConfig[item.key as keyof typeof statusConfig].label}</div>
                  <div className={`text-2xl font-bold ${statusConfig[item.key as keyof typeof statusConfig].textColor}`}>
                    {item.count}
                  </div>
                </div>
              )
            ))}
          </div>
        </div>

        {/* FILTERS - 2 linhas */}
        <Card className="border-[#e8e5df]">
          <CardContent className="p-4">
            {/* Linha 1: Search + Filtros Button */}
            <div className="flex gap-3 mb-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar por evento, tipo ou ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 border-[#e8e5df] bg-white"
                  data-testid="input-search"
                />
              </div>
              <Button variant="outline" size="sm" className="border-[#e8e5df]">
                <Filter className="h-4 w-4 mr-2" />
                Filtros
              </Button>
            </div>

            {/* Linha 2: Selects */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger className="bg-white border-[#e8e5df]" data-testid="select-event-filter">
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
                <SelectTrigger className="bg-white border-[#e8e5df]" data-testid="select-type-filter">
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

              <Select value={sponsorFilter} onValueChange={setSponsorFilter}>
                <SelectTrigger className="bg-white border-[#e8e5df]" data-testid="select-sponsor-filter">
                  <SelectValue placeholder="Patrocinador" />
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
                <SelectTrigger className="bg-white border-[#e8e5df]" data-testid="select-status-filter">
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
                <SelectTrigger className="bg-white border-[#e8e5df]" data-testid="select-date-filter">
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
          </CardContent>
        </Card>

        {/* ITEMS GROUPED BY EVENT */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredItems.length === 0 ? (
            <Card className="border-[#e8e5df]">
              <CardContent className="text-center py-12">
                <AlertCircle className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 font-medium">Nenhum item encontrado</p>
                <p className="text-slate-400 text-sm mt-1">Tente ajustar os filtros</p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(itemsByEvent).map(([eventId, eventItems]) => {
              const event = events.find(e => e.id === eventId);
              return (
                <Card key={eventId} className="border-[#e8e5df] overflow-hidden">
                  {/* EVENT HEADER */}
                  <div className="bg-white px-6 py-3 border-b border-[#e8e5df] flex items-center gap-3">
                    <div className="w-5 h-5 bg-slate-900 rounded-sm flex-shrink-0"></div>
                    <div className="flex-1">
                      <h3 className="font-bold text-sm">{event?.name || 'Sem Evento'}</h3>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {event?.startDate && `${format(new Date(event.startDate), "dd/MM/yyyy", { locale: ptBR })}`}
                        {event?.truckDepartureDate && ` • Saída: ${format(new Date(event.truckDepartureDate), "dd/MM/yyyy HH:mm", { locale: ptBR })}`}
                      </div>
                    </div>
                    <Badge variant="secondary" className="ml-auto bg-slate-100">{eventItems.length} itens</Badge>
                  </div>

                  {/* TABLE */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-[#e8e5df]">
                        <tr>
                          <th className="text-left px-4 py-2 font-semibold text-slate-700">ID</th>
                          <th className="text-left px-4 py-2 font-semibold text-slate-700">Tipo</th>
                          <th className="text-left px-4 py-2 font-semibold text-slate-700">Descrição</th>
                          <th className="text-left px-4 py-2 font-semibold text-slate-700">Dimensões</th>
                          <th className="text-right px-4 py-2 font-semibold text-slate-700">m²</th>
                          <th className="text-left px-4 py-2 font-semibold text-slate-700">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eventItems.map((item, idx) => {
                          const colors = getItemStatusBadgeColor(item.status);
                          const m2 = item.m2Total ? parseFloat(item.m2Total) : 0;
                          return (
                            <Fragment key={item.id}>
                              <tr 
                                className="border-b border-[#e8e5df] hover:bg-slate-50 cursor-pointer transition-colors"
                                onClick={() => setSelectedItem(item)}
                                data-testid={`row-item-${item.id}`}
                              >
                                <td className="px-4 py-3">
                                  <code className="bg-slate-100 px-2 py-1 rounded text-xs font-mono font-semibold text-slate-700">
                                    {item.displayId || item.id}
                                  </code>
                                </td>
                                <td className="px-4 py-3">
                                  <Badge variant="outline" className="border-[#e8e5df]">
                                    {item.type}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-slate-700">{item.description || item.name}</td>
                                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                                  {item.fileWidth && item.fileHeight && (
                                    <span>Arq: {item.fileWidth}×{item.fileHeight}m</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 font-bold text-right">
                                  <span className={m2 > 10 ? 'text-red-600' : 'text-slate-700'}>
                                    {m2.toFixed(2)}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${colors.bg} ${colors.border} text-xs font-medium`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`}></span>
                                    {getStatusLabel(item.status)}
                                  </div>
                                </td>
                              </tr>
                              {item.observations && (
                                <tr className="bg-amber-50/60 border-b border-[#e8e5df]">
                                  <td colSpan={6} className="px-4 py-3">
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
