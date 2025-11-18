import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronDown, ChevronUp, Calendar, User, Package2, MessageSquare, History } from "lucide-react";
import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import { CommentsSection } from "@/components/comments-section";
import type { Item } from "@shared/schema";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function PainelGeral() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/items"],
    placeholderData: [],
  });

  const { data: events = [] } = useQuery<any[]>({
    queryKey: ["/api/events"],
    placeholderData: [],
  });

  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs"],
    placeholderData: [],
  });

  const filteredItems = items
    .filter((item) => {
      const matchesSearch = 
        item.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.event?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.displayId?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesEvent = eventFilter === "all" || item.eventId === eventFilter;
      return matchesSearch && matchesStatus && matchesEvent;
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const stats = {
    total: filteredItems.length,
    requested: filteredItems.filter(i => i.status === 'requested').length,
    awaitingLinking: filteredItems.filter(i => i.status === 'awaiting_linking').length,
    awaitingSubmission: filteredItems.filter(i => i.status === 'awaiting_submission').length,
    awaitingApproval: filteredItems.filter(i => i.status === 'awaiting_approval' || i.status === 'awaiting_sponsor_approval').length,
    awaitingFinalization: filteredItems.filter(i => i.status === 'awaiting_finalization' || i.status === 'sponsor_approved').length,
    awaitingFinalReview: filteredItems.filter(i => i.status === 'awaiting_final_review' || i.status === 'awaiting_creator_review').length,
    readyForProduction: filteredItems.filter(i => i.status === 'ready_for_production').length,
    approved: filteredItems.filter(i => i.status === 'approved').length,
    inProduction: filteredItems.filter(i => i.status === 'inProduction').length,
    produced: filteredItems.filter(i => i.status === 'produced').length,
    delivered: filteredItems.filter(i => i.status === 'delivered').length,
  };

  const toggleItemExpansion = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
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

      {/* Dashboard - 11 Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'all' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Total</CardTitle>
            <Package2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total">{stats.total}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'requested' ? 'ring-2 ring-yellow-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'requested' ? 'all' : 'requested')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Solicitado</CardTitle>
            <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{stats.requested}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'awaiting_linking' ? 'ring-2 ring-orange-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'awaiting_linking' ? 'all' : 'awaiting_linking')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Aguard. Vinculação</CardTitle>
            <div className="h-3 w-3 rounded-full bg-orange-500"></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{stats.awaitingLinking}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'awaiting_submission' ? 'ring-2 ring-blue-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'awaiting_submission' ? 'all' : 'awaiting_submission')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Aguard. Envio</CardTitle>
            <div className="h-3 w-3 rounded-full bg-blue-500"></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{stats.awaitingSubmission}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'awaiting_approval' || statusFilter === 'awaiting_sponsor_approval' ? 'ring-2 ring-rose-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'awaiting_approval' || statusFilter === 'awaiting_sponsor_approval' ? 'all' : 'awaiting_approval')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Aguard. Aprovação</CardTitle>
            <div className="h-3 w-3 rounded-full bg-rose-500"></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-700 dark:text-rose-400">{stats.awaitingApproval}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'awaiting_finalization' || statusFilter === 'sponsor_approved' ? 'ring-2 ring-purple-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'awaiting_finalization' || statusFilter === 'sponsor_approved' ? 'all' : 'awaiting_finalization')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Aguard. Finalização</CardTitle>
            <div className="h-3 w-3 rounded-full bg-purple-500"></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-700 dark:text-purple-400">{stats.awaitingFinalization}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'awaiting_final_review' || statusFilter === 'awaiting_creator_review' ? 'ring-2 ring-violet-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'awaiting_final_review' || statusFilter === 'awaiting_creator_review' ? 'all' : 'awaiting_final_review')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Aguard. Revisão</CardTitle>
            <div className="h-3 w-3 rounded-full bg-violet-500"></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-violet-700 dark:text-violet-400">{stats.awaitingFinalReview}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'ready_for_production' ? 'ring-2 ring-cyan-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'ready_for_production' ? 'all' : 'ready_for_production')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Pronto Produção</CardTitle>
            <div className="h-3 w-3 rounded-full bg-cyan-500"></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-700 dark:text-cyan-400">{stats.readyForProduction}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'approved' ? 'ring-2 ring-green-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'approved' ? 'all' : 'approved')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Liberado</CardTitle>
            <div className="h-3 w-3 rounded-full bg-green-500"></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700 dark:text-green-400">{stats.approved}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'inProduction' ? 'ring-2 ring-status-production' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'inProduction' ? 'all' : 'inProduction')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Em Produção</CardTitle>
            <Package2 className="h-4 w-4 text-status-production" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-production">{stats.inProduction}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'produced' ? 'ring-2 ring-fuchsia-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'produced' ? 'all' : 'produced')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Produzido</CardTitle>
            <div className="h-3 w-3 rounded-full bg-fuchsia-500"></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-fuchsia-700 dark:text-fuchsia-400">{stats.produced}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover-elevate ${statusFilter === 'delivered' ? 'ring-2 ring-emerald-600' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'delivered' ? 'all' : 'delivered')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Entregue</CardTitle>
            <div className="h-3 w-3 rounded-full bg-emerald-600"></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{stats.delivered}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
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
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="w-full md:w-[250px]" data-testid="select-event-filter">
                <SelectValue placeholder="Todos os eventos" />
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
          </div>
        </CardContent>
      </Card>

      {/* Items - Cards Expandíveis */}
      <div className="space-y-3">
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
          filteredItems.map((item) => {
            const isExpanded = expandedItems.has(item.id);
            const itemLogs = getItemLogs(item.id);

            return (
              <Card key={item.id} className="overflow-hidden" data-testid={`card-item-${item.id}`}>
                <Collapsible open={isExpanded} onOpenChange={() => toggleItemExpansion(item.id)}>
                  {/* Header do Card (Sempre visível) */}
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover-elevate">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="flex-shrink-0">
                            <div className="text-lg font-mono font-bold text-primary" data-testid={`text-display-id-${item.id}`}>
                              {item.displayId}
                            </div>
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="font-semibold">
                                {item.type}
                              </Badge>
                              {item.event && (
                                <Badge variant="secondary" className="text-xs">
                                  <Calendar className="h-3 w-3 mr-1" />
                                  {item.event.name}
                                </Badge>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-sm text-muted-foreground mt-1 truncate">
                                {item.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                          <StatusBadge status={item.status} />
                          <div className="text-right hidden md:block">
                            <div className="text-sm font-semibold">
                              {item.quantity} un.
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {item.calculatedM2} m²
                            </div>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>

                  {/* Conteúdo Expandível */}
                  <CollapsibleContent>
                    <CardContent className="space-y-6 pt-0">
                      {/* Detalhes Completos */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 bg-muted/30 rounded-lg">
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm text-muted-foreground uppercase">Especificações</h4>
                          <div className="space-y-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Material:</span>
                              <span className="ml-2 font-medium">{item.material}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Acabamento:</span>
                              <span className="ml-2 font-medium">{item.finish}</span>
                            </div>
                            {item.visualWidth && item.visualHeight && (
                              <div>
                                <span className="text-muted-foreground">Visual:</span>
                                <span className="ml-2 font-medium">{item.visualWidth} × {item.visualHeight}</span>
                              </div>
                            )}
                            {item.fileWidth && item.fileHeight && (
                              <div>
                                <span className="text-muted-foreground">Arquivo:</span>
                                <span className="ml-2 font-medium">{item.fileWidth} × {item.fileHeight}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm text-muted-foreground uppercase">Produção</h4>
                          <div className="space-y-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Solicitado:</span>
                              <span className="ml-2 font-medium">{item.quantity} un.</span>
                            </div>
                            {item.quantityProduced !== null && (
                              <div>
                                <span className="text-muted-foreground">Produzido:</span>
                                <span className="ml-2 font-medium text-status-production">{item.quantityProduced} un.</span>
                              </div>
                            )}
                            <div>
                              <span className="text-muted-foreground">Total m²:</span>
                              <span className="ml-2 font-medium">{item.calculatedM2}</span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm text-muted-foreground uppercase">Observações</h4>
                          {item.observations ? (
                            <p className="text-sm">{item.observations}</p>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">Nenhuma observação</p>
                          )}
                        </div>
                      </div>

                      {/* Timeline de Histórico */}
                      {itemLogs.length > 0 && (
                        <div className="p-4 bg-muted/30 rounded-lg">
                          <h4 className="font-semibold text-sm text-muted-foreground uppercase mb-4 flex items-center gap-2">
                            <History className="h-4 w-4" />
                            Histórico de Ações
                          </h4>
                          <div className="space-y-3">
                            {itemLogs.map((log) => (
                              <div key={log.id} className="flex items-start gap-3 text-sm">
                                <div className="flex-shrink-0 mt-0.5">
                                  <div className="h-2 w-2 rounded-full bg-primary"></div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge variant="outline" className="text-xs">
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
                                  {log.details && (
                                    <p className="text-xs text-muted-foreground mt-1">{log.details}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Comentários */}
                      <div>
                        <CommentsSection itemId={item.id} itemType={item.type} />
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
