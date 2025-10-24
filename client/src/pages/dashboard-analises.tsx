import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Package, CheckCircle, TrendingUp, AlertTriangle, Download, BarChart3 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { differenceInHours, differenceInMinutes } from "date-fns";

const STATUS_COLORS = {
  requested: "hsl(var(--status-pending))",
  approved: "hsl(var(--status-inProgress))",
  inProduction: "hsl(var(--status-production))",
  produced: "hsl(var(--status-completed))",
  delivered: "hsl(var(--status-completed))",
};

export default function DashboardAnalises() {
  const { data: items = [] } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const { data: events = [] } = useQuery<any[]>({
    queryKey: ["/api/events"],
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
    const rows = items.map(item => [
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
    link.download = `relatorio-completo-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2" data-testid="title-dashboard-analises">
            <BarChart3 className="h-6 w-6" />
            Dashboard de Análises e Desempenho
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Métricas avançadas, gráficos e relatórios de produtividade
          </p>
        </div>
        <Button onClick={exportToCSV} variant="outline" data-testid="button-export-csv">
          <Download className="h-4 w-4 mr-2" />
          Exportar Relatório Completo
        </Button>
      </div>

      {/* Alertas de Prazo */}
      {urgentEvents.length > 0 && (
        <Card className="border-destructive bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              ⚠️ Eventos Urgentes - Saída do Caminhão Próxima!
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
                  <div 
                    key={event.id} 
                    className={`p-4 rounded-lg border-2 ${isVeryUrgent ? 'border-destructive bg-destructive/10' : 'border-orange-500 bg-orange-500/10'}`}
                    data-testid={`alert-urgent-${event.id}`}
                  >
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

      {/* Estatísticas de Desempenho */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tempo Médio de Liberação</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-approval-time">{avgApprovalTime.toFixed(1)}h</div>
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
            <div className="text-2xl font-bold" data-testid="metric-production-time">{avgProductionTime.toFixed(1)}h</div>
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
            <div className="text-2xl font-bold" data-testid="metric-delivery-rate">{onTimeRate.toFixed(0)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              Eventos finalizados completos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Item Mais Produzido</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-top-item">{topItems[0]?.[0] || "N/A"}</div>
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
            <CardTitle>Produção por Evento</CardTitle>
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

      {/* Top 5 Itens Mais Produzidos */}
      <Card>
        <CardHeader>
          <CardTitle>Top 5 Itens Mais Produzidos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {topItems.map(([type, count], index) => (
              <div key={type} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 bg-primary text-primary-foreground rounded-full font-bold">
                    {index + 1}
                  </div>
                  <span className="font-medium">{type}</span>
                </div>
                <span className="text-2xl font-bold text-primary">{count}</span>
              </div>
            ))}
            {topItems.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum item produzido ainda
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
