import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, AlertCircle, Clock, Package, CheckCircle, Filter } from "lucide-react";
import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";

export default function PainelGeral() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [materialFilter, setMaterialFilter] = useState<string>("all");
  const [finishFilter, setFinishFilter] = useState<string>("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

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

  const filteredItems = items
    .filter((item) => {
      const matchesSearch = item.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (item.event?.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesEvent = eventFilter === "all" || item.eventId === eventFilter;
      const matchesMaterial = materialFilter === "all" || item.material === materialFilter;
      const matchesFinish = finishFilter === "all" || item.finish === finishFilter;
      return matchesSearch && matchesStatus && matchesEvent && matchesMaterial && matchesFinish;
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
    total: items.length,
    requested: items.filter(i => i.status === 'requested').length,
    approved: items.filter(i => i.status === 'approved').length,
    inProduction: items.filter(i => i.status === 'inProduction').length,
    produced: items.filter(i => i.status === 'produced').length,
    delivered: items.filter(i => i.status === 'delivered').length,
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
                <Select value={materialFilter} onValueChange={setMaterialFilter}>
                  <SelectTrigger className="w-full sm:w-48" data-testid="select-material-filter">
                    <SelectValue placeholder="Filtrar por material" />
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
                  <SelectTrigger className="w-full sm:w-48" data-testid="select-finish-filter">
                    <SelectValue placeholder="Filtrar por acabamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os acabamentos</SelectItem>
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
                    <th className="text-left py-3 px-4 font-medium">Evento</th>
                    <th className="text-left py-3 px-4 font-medium">Item</th>
                    <th className="text-left py-3 px-4 font-medium">Qtd Total</th>
                    <th className="text-left py-3 px-4 font-medium">Qtd Produzida</th>
                    <th className="text-left py-3 px-4 font-medium">Área × Visual</th>
                    <th className="text-left py-3 px-4 font-medium">m²</th>
                    <th className="text-left py-3 px-4 font-medium">Status</th>
                    <th className="text-left py-3 px-4 font-medium">Atualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, index) => {
                    const prevItem = index > 0 ? filteredItems[index - 1] : null;
                    const showEventHeader = !prevItem || prevItem.event?.name !== item.event?.name;
                    const showTypeHeader = !prevItem || prevItem.event?.name !== item.event?.name || prevItem.type !== item.type;
                    
                    return (
                      <Fragment key={item.id}>
                        {showTypeHeader && (
                          <tr key={`group-${item.eventId}-${item.type}`} className="bg-primary/5 border-y-2 border-primary/20">
                            <td colSpan={8} className="py-2 px-4">
                              <div className="flex items-center gap-3">
                                <div className="h-5 w-1 bg-primary rounded-full"></div>
                                <div>
                                  {showEventHeader && (
                                    <div className="text-xs font-semibold text-primary uppercase tracking-wider">
                                      {item.event?.name || 'Sem Evento'}
                                    </div>
                                  )}
                                  <div className="text-sm font-bold text-foreground">
                                    {item.type}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr 
                          key={item.id}
                          className="border-b border-border hover-elevate"
                          data-testid={`row-item-${item.id}`}
                        >
                          <td className="py-3 px-4">
                            <div className="font-medium text-sm">{item.event?.name || 'N/A'}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-sm">{item.type}</div>
                            {item.material && (
                              <div className="text-xs text-muted-foreground">{item.material}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm tabular-nums">{item.quantity}</td>
                          <td className="py-3 px-4">
                            {item.quantityProduced ? (
                              <div className="text-sm font-semibold tabular-nums text-status-production">
                                {item.quantityProduced}
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground">-</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm tabular-nums">{item.area} × {item.visual}</td>
                          <td className="py-3 px-4 text-sm font-medium tabular-nums">{item.calculatedM2}</td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-1">
                              <StatusBadge status={item.status} />
                              {item.status === 'approved' || item.status === 'inProduction' || item.status === 'produced' || item.status === 'delivered' ? (
                                <div className="text-xs text-muted-foreground">
                                  {(() => {
                                    const approvedLog = auditLogMap.get(`${item.id}-approved`);
                                    return approvedLog ? `Aprovado por ${approvedLog.userName.split(' ')[0]}` : null;
                                  })()}
                                </div>
                              ) : null}
                              {item.status === 'delivered' ? (
                                <div className="text-xs text-muted-foreground">
                                  {(() => {
                                    const deliveredLog = auditLogMap.get(`${item.id}-delivered`);
                                    return deliveredLog ? `Entregue por ${deliveredLog.userName.split(' ')[0]}` : null;
                                  })()}
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm text-muted-foreground">
                            {new Date(item.updatedAt).toLocaleDateString('pt-BR')}
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
    </div>
  );
}
