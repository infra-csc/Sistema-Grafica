import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, AlertCircle, Clock, Package, CheckCircle, TrendingUp, AlertTriangle, Download } from "lucide-react";
import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { formatDistanceToNow, differenceInHours, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_COLORS = {
  requested: "hsl(var(--status-pending))",
  approved: "hsl(var(--status-inProgress))",
  inProduction: "hsl(var(--status-production))",
  produced: "hsl(var(--status-completed))",
  delivered: "hsl(var(--status-completed))",
};

export default function PainelGeral() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");

  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const { data: events = [] } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (item.event?.name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    const matchesEvent = eventFilter === "all" || item.eventId === eventFilter;
    return matchesSearch && matchesStatus && matchesEvent;
  });

  const stats = {
    total: items.length,
    requested: items.filter(i => i.status === 'requested').length,
    approved: items.filter(i => i.status === 'approved').length,
    inProduction: items.filter(i => i.status === 'inProduction').length,
    produced: items.filter(i => i.status === 'produced').length,
    delivered: items.filter(i => i.status === 'delivered').length,
  };

  // Gráfico de pizza para status
  const pieData = [
    { name: 'Solicitado', value: stats.requested, color: STATUS_COLORS.requested },
    { name: 'Liberado', value: stats.approved, color: STATUS_COLORS.approved },
    { name: 'Em Produção', value: stats.inProduction, color: STATUS_COLORS.inProduction },
    { name: 'Produzido', value: stats.produced, color: STATUS_COLORS.produced },
    { name: 'Entregue', value: stats.delivered, color: STATUS_COLORS.delivered },
  ].filter(item => item.value > 0);

  // Gráfico de barras para itens por evento
  const barData = events.map(event => ({
    name: event.name.length > 15 ? event.name.substring(0, 15) + '...' : event.name,
    items: items.filter(i => i.eventId === event.id).length,
    delivered: items.filter(i => i.eventId === event.id && i.status === 'delivered').length,
  })).filter(e => e.items > 0);

  // Eventos urgentes (< 48h para saída do caminhão)
  const now = new Date();
  const urgentEvents = events.filter(event => {
    const departure = new Date(event.truckDepartureDate);
    const hoursUntil = differenceInHours(departure, now);
    return hoursUntil > 0 && hoursUntil < 48;
  }).sort((a, b) => {
    const aTime = new Date(a.truckDepartureDate).getTime();
    const bTime = new Date(b.truckDepartureDate).getTime();
    return aTime - bTime;
  });

  // Estatísticas de desempenho
  const approvedItems = items.filter(i => i.approvedAt);
  const avgApprovalTime = approvedItems.length > 0
    ? approvedItems.reduce((sum, item) => {
        const created = new Date(item.createdAt);
        const approved = new Date(item.approvedAt!);
        return sum + differenceInHours(approved, created);
      }, 0) / approvedItems.length
    : 0;

  const deliveredItems = items.filter(i => i.deliveredAt);
  const avgProductionTime = deliveredItems.length > 0
    ? deliveredItems.reduce((sum, item) => {
        if (!item.approvedAt) return sum;
        const approved = new Date(item.approvedAt);
        const delivered = new Date(item.deliveredAt!);
        return sum + differenceInHours(delivered, approved);
      }, 0) / deliveredItems.length
    : 0;

  // Taxa de entrega no prazo
  const completedEvents = events.filter(e => e.status === 'completed');
  const onTimeRate = completedEvents.length > 0
    ? (completedEvents.filter(e => {
        const eventItems = items.filter(i => i.eventId === e.id);
        const allDelivered = eventItems.every(i => i.status === 'delivered');
        return allDelivered;
      }).length / completedEvents.length) * 100
    : 0;

  // Itens mais produzidos
  const itemTypeCounts = items.reduce((acc: Record<string, number>, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {});
  const topItems = Object.entries(itemTypeCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const exportToCSV = () => {
    const headers = ["Evento", "Item", "Qtd Total", "Qtd Produzida", "Área", "Visual", "m²", "Status", "Material", "Acabamento"];
    const rows = filteredItems.map(item => [
      item.event?.name || "N/A",
      item.type,
      item.quantity,
      item.quantityProduced || 0,
      item.area,
      item.visual,
      item.calculatedM2,
      item.status,
      item.material,
      item.finish,
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio-producao-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="title-painel-geral">
            Painel de Status Geral
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Acompanhamento em tempo real de todos os itens e métricas de desempenho
          </p>
        </div>
        <Button onClick={exportToCSV} variant="outline" data-testid="button-export-csv">
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Alertas de Prazo */}
      {urgentEvents.length > 0 && (
        <Card className="border-destructive bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Eventos Urgentes - Saída do Caminhão Próxima!
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {urgentEvents.map(event => {
                const departure = new Date(event.truckDepartureDate);
                const hoursUntil = differenceInHours(departure, now);
                const minutesUntil = differenceInMinutes(departure, now) % 60;
                const isVeryUrgent = hoursUntil < 24;

                return (
                  <div key={event.id} className={`p-4 rounded-lg border-2 ${isVeryUrgent ? 'border-destructive bg-destructive/10' : 'border-orange-500 bg-orange-500/10'}`}>
                    <h3 className="font-semibold mb-1">{event.name}</h3>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4" />
                      <span className="font-bold text-lg">
                        {hoursUntil}h {minutesUntil}min
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Saída: {new Date(event.truckDepartureDate).toLocaleString('pt-BR')}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cards de Estatísticas */}
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Produzidos</CardTitle>
            <CheckCircle className="h-4 w-4 text-status-completed" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-completed" data-testid="stat-produced">{stats.produced}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entregues</CardTitle>
            <CheckCircle className="h-4 w-4 text-status-completed" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-completed" data-testid="stat-delivered">{stats.delivered}</div>
          </CardContent>
        </Card>
      </div>

      {/* Estatísticas de Desempenho */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tempo Médio de Aprovação</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgApprovalTime.toFixed(1)}h</div>
            <p className="text-xs text-muted-foreground mt-1">
              Solicitação → Arte Liberada
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tempo Médio de Produção</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgProductionTime.toFixed(1)}h</div>
            <p className="text-xs text-muted-foreground mt-1">
              Arte Liberada → Entregue
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Entrega</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{onTimeRate.toFixed(0)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              Eventos finalizados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Item Mais Produzido</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{topItems[0]?.[0] || "N/A"}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {topItems[0]?.[1] || 0} unidades
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gráfico de Pizza - Distribuição por Status */}
        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Status</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                Nenhum dado disponível
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gráfico de Barras - Itens por Evento */}
        <Card>
          <CardHeader>
            <CardTitle>Itens por Evento</CardTitle>
          </CardHeader>
          <CardContent>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="items" fill="hsl(var(--primary))" name="Total de Itens" />
                  <Bar dataKey="delivered" fill="hsl(var(--status-completed))" name="Entregues" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                Nenhum dado disponível
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabela de Todos os Itens */}
      <Card>
        <CardHeader>
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
            </div>
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
                  {filteredItems.map((item, index) => (
                    <tr 
                      key={item.id}
                      className={`border-b border-border hover-elevate ${index % 2 === 0 ? 'bg-muted/30' : ''}`}
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
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {new Date(item.updatedAt).toLocaleDateString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
