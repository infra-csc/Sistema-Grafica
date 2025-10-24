import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, AlertCircle, Clock, Package, CheckCircle, Filter, Calendar, Truck, Info } from "lucide-react";
import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import { ItemTimelineDialog } from "@/components/item-timeline-dialog";
import type { Item } from "@shared/schema";

export default function PainelGeral() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [materialFilter, setMaterialFilter] = useState<string>("all");
  const [finishFilter, setFinishFilter] = useState<string>("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [timelineDialogOpen, setTimelineDialogOpen] = useState(false);

  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const { data: events = [] } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs"],
  });

  // Criar mapa de audit logs
  const auditLogMap = new Map<string, any>();
  auditLogs.forEach(log => {
    const key = `${log.entityId}-${log.action}`;
    auditLogMap.set(key, log);
  });

  // Obter tipos únicos para o filtro
  const uniqueTypes = Array.from(new Set(items.map(item => item.type))).sort();

  const filteredItems = items
    .filter((item) => {
      const matchesSearch = item.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (item.event?.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesEvent = eventFilter === "all" || item.eventId === eventFilter;
      const matchesType = typeFilter === "all" || item.type === typeFilter;
      const matchesMaterial = materialFilter === "all" || item.material === materialFilter;
      const matchesFinish = finishFilter === "all" || item.finish === finishFilter;
      return matchesSearch && matchesStatus && matchesEvent && matchesType && matchesMaterial && matchesFinish;
    })
    .sort((a, b) => {
      // Primeiro ordenar por evento
      const eventA = a.event?.name || '';
      const eventB = b.event?.name || '';
      if (eventA !== eventB) {
        return eventA.localeCompare(eventB);
      }
      // Depois ordenar por tipo
      return a.type.localeCompare(b.type);
    });

  const stats = {
    total: filteredItems.length,
    requested: filteredItems.filter(i => i.status === 'requested').length,
    approved: filteredItems.filter(i => i.status === 'approved').length,
    inProduction: filteredItems.filter(i => i.status === 'inProduction').length,
    produced: filteredItems.filter(i => i.status === 'produced').length,
    delivered: filteredItems.filter(i => i.status === 'delivered').length,
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="title-painel-geral">
          Painel de Status Geral
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Acompanhamento em tempo real de todos os itens
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Solicitados</CardTitle>
            <Clock className="h-4 w-4 text-status-pending" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-pending" data-testid="stat-requested">{stats.requested}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Liberados</CardTitle>
            <CheckCircle className="h-4 w-4 text-status-inProgress" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-inProgress" data-testid="stat-approved">{stats.approved}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Produção</CardTitle>
            <Package className="h-4 w-4 text-status-production" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-production" data-testid="stat-production">{stats.inProduction}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Produção parcial
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Produzidos</CardTitle>
            <CheckCircle className="h-4 w-4 text-status-completed" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-completed" data-testid="stat-produced">{stats.produced}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Não entregue
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entregues</CardTitle>
            <CheckCircle className="h-4 w-4 text-status-completed" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-completed" data-testid="stat-delivered">{stats.delivered}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Para alguém
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <CardTitle>Todos os Itens</CardTitle>
              <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                <div className="relative flex-1 sm:flex-initial">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por item ou evento..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 w-full sm:w-64"
                    data-testid="input-search"
                  />
                </div>
                <Select value={eventFilter} onValueChange={setEventFilter}>
                  <SelectTrigger className="w-full sm:w-48" data-testid="select-event-filter">
                    <SelectValue placeholder="Filtrar por evento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os eventos</SelectItem>
                    {events.map((event) => (
                      <SelectItem key={event.id} value={event.id}>
                        {event.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-48" data-testid="select-status-filter">
                    <SelectValue placeholder="Filtrar por status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="requested">Solicitado</SelectItem>
                    <SelectItem value="approved">Liberado</SelectItem>
                    <SelectItem value="inProduction">Em Produção</SelectItem>
                    <SelectItem value="produced">Produzido</SelectItem>
                    <SelectItem value="delivered">Entregue</SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  variant="outline" 
                  size="default"
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className="w-full sm:w-auto"
                  data-testid="button-advanced-filters"
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Filtros Avançados
                </Button>
              </div>
            </div>
            
            {showAdvancedFilters && (
              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-full sm:w-auto sm:min-w-[180px]" data-testid="select-type-filter">
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
                <Select value={materialFilter} onValueChange={setMaterialFilter}>
                  <SelectTrigger className="w-full sm:w-auto sm:min-w-[180px]" data-testid="select-material-filter">
                    <SelectValue placeholder="Material" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os materiais</SelectItem>
                    <SelectItem value="Lona">Lona</SelectItem>
                    <SelectItem value="Tecido">Tecido</SelectItem>
                    <SelectItem value="Adesivo">Adesivo</SelectItem>
                    <SelectItem value="Vinílico">Vinílico</SelectItem>
                    <SelectItem value="Banner">Banner</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={finishFilter} onValueChange={setFinishFilter}>
                  <SelectTrigger className="w-full sm:w-auto sm:min-w-[180px]" data-testid="select-finish-filter">
                    <SelectValue placeholder="Acabamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos acabamentos</SelectItem>
                    <SelectItem value="Ilhós">Ilhós</SelectItem>
                    <SelectItem value="Soldado">Soldado</SelectItem>
                    <SelectItem value="Bastão">Bastão</SelectItem>
                    <SelectItem value="Sem acabamento">Sem acabamento</SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    setTypeFilter("all");
                    setMaterialFilter("all");
                    setFinishFilter("all");
                  }}
                  className="w-full sm:w-auto"
                >
                  Limpar Filtros
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Nenhum item encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium">Descrição</th>
                    <th className="text-center py-3 px-4 font-medium">Quantidade</th>
                    <th className="text-left py-3 px-4 font-medium">Área × Visual</th>
                    <th className="text-center py-3 px-4 font-medium">m²</th>
                    <th className="text-left py-3 px-4 font-medium">Material</th>
                    <th className="text-left py-3 px-4 font-medium">Status</th>
                    <th className="text-left py-3 px-4 font-medium">Atualizado</th>
                    <th className="text-center py-3 px-4 font-medium w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, index) => {
                    const prevItem = index > 0 ? filteredItems[index - 1] : null;
                    const showEventHeader = !prevItem || prevItem.event?.name !== item.event?.name;
                    const showTypeHeader = !prevItem || prevItem.event?.name !== item.event?.name || prevItem.type !== item.type;
                    
                    // Calcular índice do evento para cores alternadas
                    let eventIndex = 0;
                    if (item.event) {
                      const uniqueEvents = Array.from(new Set(filteredItems.map(i => i.event?.id).filter(Boolean)));
                      eventIndex = uniqueEvents.indexOf(item.event.id);
                    }
                    const isEvenEvent = eventIndex % 2 === 0;
                    
                    return (
                      <Fragment key={item.id}>
                        {showEventHeader && (
                          <tr className="bg-gradient-to-r from-primary/10 to-primary/5 border-t-4 border-primary/30">
                            <td colSpan={8} className="py-3 px-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div className="h-6 w-1.5 bg-primary rounded-full flex-shrink-0"></div>
                                  <div className="text-sm font-bold text-primary uppercase tracking-wider break-words">
                                    {item.event?.name || 'Sem Evento'}
                                  </div>
                                </div>
                                {item.event && (
                                  <div className="flex items-center gap-3 text-xs flex-shrink-0">
                                    <div className="flex items-center gap-1.5 text-muted-foreground whitespace-nowrap">
                                      <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                                      <span className="hidden sm:inline">Início: </span>
                                      <strong className="text-foreground">{new Date(item.event.startDate).toLocaleDateString('pt-BR')}</strong>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-muted-foreground whitespace-nowrap">
                                      <Truck className="h-3.5 w-3.5 flex-shrink-0" />
                                      <span className="hidden sm:inline">Saída: </span>
                                      <strong className="text-foreground">{new Date(item.event.truckDepartureDate).toLocaleDateString('pt-BR')}</strong>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        {showTypeHeader && (
                          <tr key={`group-${item.eventId}-${item.type}`} className={`border-y border-primary/10 ${isEvenEvent ? 'bg-muted/20' : 'bg-muted/10'}`}>
                            <td colSpan={8} className="py-1.5 px-4">
                              <div className="flex items-center gap-2">
                                <div className="h-4 w-0.5 bg-primary/40 rounded-full"></div>
                                <div className="text-sm font-bold text-foreground">
                                  {item.type}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr 
                          key={item.id}
                          className={`border-b border-border hover-elevate ${isEvenEvent ? 'bg-muted/5' : 'bg-background'}`}
                          data-testid={`row-item-${item.id}`}
                        >
                          <td className="py-3 px-4">
                            {item.description ? (
                              <div className="text-sm text-foreground">{item.description}</div>
                            ) : (
                              <div className="text-sm text-muted-foreground">—</div>
                            )}
                            {item.observations && (
                              <div className="text-xs text-muted-foreground italic mt-0.5">{item.observations}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="text-sm tabular-nums">
                              {item.quantityProduced ? (
                                <>
                                  <span>{item.quantity}</span>
                                  <span className="text-muted-foreground mx-1">/</span>
                                  <span className="font-semibold text-status-production">{item.quantityProduced}</span>
                                </>
                              ) : (
                                <span>{item.quantity} unid.</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm tabular-nums">{item.area} × {item.visual}</td>
                          <td className="py-3 px-4 text-center text-sm font-medium tabular-nums">{item.calculatedM2}</td>
                          <td className="py-3 px-4 text-sm">
                            <div>{item.material}</div>
                            <div className="text-xs text-muted-foreground">{item.finish}</div>
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge status={item.status} />
                          </td>
                          <td className="py-3 px-4 text-sm text-muted-foreground">
                            {new Date(item.updatedAt).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setSelectedItem(item);
                                setTimelineDialogOpen(true);
                              }}
                              data-testid={`button-timeline-${item.id}`}
                            >
                              <Info className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ItemTimelineDialog
        item={selectedItem}
        auditLogs={auditLogs}
        open={timelineDialogOpen}
        onOpenChange={setTimelineDialogOpen}
      />
    </div>
  );
}
