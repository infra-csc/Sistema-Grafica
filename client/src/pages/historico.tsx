import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Calendar, 
  Package, 
  CheckCircle, 
  Clock, 
  Truck,
  FileCheck,
  Plus,
  Activity
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TimelineEvent {
  id: string;
  type: 'event_created' | 'item_created' | 'item_approved' | 'production_started' | 'item_delivered';
  timestamp: Date;
  eventName: string;
  eventId: string;
  itemType?: string;
  itemId?: string;
  quantity?: number;
  quantityProduced?: number;
  receivedBy?: string;
  userName?: string; // Nome de quem fez a ação
}

export default function Historico() {
  const [, setLocation] = useLocation();
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");

  const { data: events = [] } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const { data: items = [] } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs"],
  });

  // Criar mapa de audit logs por entityId e action para lookup rápido
  const auditLogMap = new Map<string, any>();
  auditLogs.forEach(log => {
    const key = `${log.entityId}-${log.action}`;
    auditLogMap.set(key, log);
  });

  // Construir timeline a partir de eventos e itens
  const timeline: TimelineEvent[] = [];

  // Adicionar eventos criados
  events.forEach(event => {
    const auditLog = auditLogMap.get(`${event.id}-created`);
    timeline.push({
      id: `event-${event.id}`,
      type: 'event_created',
      timestamp: new Date(event.createdAt),
      eventName: event.name,
      eventId: event.id,
      userName: auditLog?.userName,
    });
  });

  // Adicionar itens e suas mudanças de status
  items.forEach(item => {
    const event = events.find(e => e.id === item.eventId);
    const eventName = event?.name || 'Evento desconhecido';

    // Item criado
    const itemCreatedLog = auditLogMap.get(`${item.id}-created`);
    timeline.push({
      id: `item-created-${item.id}`,
      type: 'item_created',
      timestamp: new Date(item.createdAt),
      eventName,
      eventId: item.eventId,
      itemType: item.type,
      itemId: item.id,
      quantity: item.quantity,
      userName: itemCreatedLog?.userName,
    });

    // Item aprovado (se status >= approved)
    if (['approved', 'inProduction', 'produced', 'delivered'].includes(item.status)) {
      const itemApprovedLog = auditLogMap.get(`${item.id}-approved`);
      timeline.push({
        id: `item-approved-${item.id}`,
        type: 'item_approved',
        // Usa approvedAt se existir, senão usa updatedAt como fallback
        timestamp: new Date(item.approvedAt || item.updatedAt),
        eventName,
        eventId: item.eventId,
        itemType: item.type,
        itemId: item.id,
        quantity: item.quantity,
        userName: itemApprovedLog?.userName,
      });
    }

    // Produção iniciada (se tem quantidade produzida)
    if (item.quantityProduced && item.quantityProduced > 0) {
      timeline.push({
        id: `production-${item.id}`,
        type: 'production_started',
        // Usa productionStartedAt se existir, senão usa updatedAt como fallback
        timestamp: new Date(item.productionStartedAt || item.updatedAt),
        eventName,
        eventId: item.eventId,
        itemType: item.type,
        itemId: item.id,
        quantity: item.quantity,
        quantityProduced: item.quantityProduced,
      });
    }

    // Item entregue
    if (item.status === 'delivered' && item.deliveredAt) {
      const itemDeliveredLog = auditLogMap.get(`${item.id}-delivered`);
      timeline.push({
        id: `delivered-${item.id}`,
        type: 'item_delivered',
        timestamp: new Date(item.deliveredAt),
        eventName,
        eventId: item.eventId,
        itemType: item.type,
        itemId: item.id,
        receivedBy: item.receivedBy,
        userName: itemDeliveredLog?.userName,
      });
    }
  });

  // Ordenar por data (mais recente primeiro)
  const sortedTimeline = timeline.sort((a, b) => 
    b.timestamp.getTime() - a.timestamp.getTime()
  );

  // Filtrar por evento
  let filteredTimeline = eventFilter === "all" 
    ? sortedTimeline 
    : sortedTimeline.filter(event => event.eventId === eventFilter);

  // Filtrar por tipo de ação
  if (actionFilter !== "all") {
    filteredTimeline = filteredTimeline.filter(event => event.type === actionFilter);
  }

  const getEventConfig = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'event_created':
        return {
          icon: Calendar,
          color: 'bg-primary/10 text-primary border-primary/20',
          iconColor: 'text-primary',
          label: 'Evento Criado',
          bgClass: 'bg-primary/5',
        };
      case 'item_created':
        return {
          icon: Plus,
          color: 'bg-status-pending/10 text-status-pending border-status-pending/20',
          iconColor: 'text-status-pending',
          label: 'Item Adicionado',
          bgClass: 'bg-status-pending/5',
        };
      case 'item_approved':
        return {
          icon: FileCheck,
          color: 'bg-status-inProgress/10 text-status-inProgress border-status-inProgress/20',
          iconColor: 'text-status-inProgress',
          label: 'Item Liberado',
          bgClass: 'bg-status-inProgress/5',
        };
      case 'production_started':
        return {
          icon: Package,
          color: 'bg-status-production/10 text-status-production border-status-production/20',
          iconColor: 'text-status-production',
          label: 'Em Produção',
          bgClass: 'bg-status-production/5',
        };
      case 'item_delivered':
        return {
          icon: Truck,
          color: 'bg-status-completed/10 text-status-completed border-status-completed/20',
          iconColor: 'text-status-completed',
          label: 'Item Entregue',
          bgClass: 'bg-status-completed/5',
        };
      default:
        return {
          icon: Clock,
          color: 'bg-muted text-muted-foreground border-border',
          iconColor: 'text-muted-foreground',
          label: 'Atividade',
          bgClass: 'bg-muted/50',
        };
    }
  };

  const getEventDescription = (event: TimelineEvent) => {
    switch (event.type) {
      case 'event_created':
        return `Evento "${event.eventName}" foi criado`;
      case 'item_created':
        return (
          <>
            <span className="font-medium">{event.itemType}</span> ({event.quantity} un.) adicionado ao evento{" "}
            <span className="font-medium">{event.eventName}</span>
          </>
        );
      case 'item_approved':
        return (
          <>
            <span className="font-medium">{event.itemType}</span> do evento{" "}
            <span className="font-medium">{event.eventName}</span> foi liberado para produção
          </>
        );
      case 'production_started':
        return (
          <>
            Produção de <span className="font-medium">{event.itemType}</span>: {event.quantityProduced}/{event.quantity} un. concluídas
          </>
        );
      case 'item_delivered':
        return (
          <>
            <span className="font-medium">{event.itemType}</span> foi entregue
            {event.receivedBy && ` para ${event.receivedBy}`}
          </>
        );
      default:
        return 'Atividade registrada';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-8 w-8 text-primary" />
            Histórico de Atividades
          </h1>
          <p className="text-muted-foreground mt-1">
            Timeline completa de todas as ações do sistema
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Atividades Recentes
            </CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-full sm:w-48" data-testid="select-action-filter">
                  <SelectValue placeholder="Tipo de ação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as ações</SelectItem>
                  <SelectItem value="event_created">Criações de eventos</SelectItem>
                  <SelectItem value="item_created">Adições de itens</SelectItem>
                  <SelectItem value="item_approved">Aprovações</SelectItem>
                  <SelectItem value="production_started">Em produção</SelectItem>
                  <SelectItem value="item_delivered">Entregas</SelectItem>
                </SelectContent>
              </Select>
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
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTimeline.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {eventFilter === "all" ? "Nenhuma atividade registrada" : "Nenhuma atividade para este evento"}
              </h3>
              <p className="text-muted-foreground">
                {eventFilter === "all" 
                  ? "As atividades aparecerão aqui conforme você usar o sistema"
                  : "Selecione outro evento ou escolha 'Todos os eventos'"}
              </p>
            </div>
          ) : (
            <div className="relative">
              {/* Linha vertical da timeline */}
              <div className="absolute left-6 top-0 bottom-0 w-px bg-border" />

              <div className="space-y-4">
                {filteredTimeline.map((event, index) => {
                  const config = getEventConfig(event.type);
                  const Icon = config.icon;
                  const timeAgo = formatDistanceToNow(event.timestamp, {
                    addSuffix: true,
                    locale: ptBR,
                  });

                  return (
                    <div
                      key={event.id}
                      className="relative pl-16 pr-4 group"
                      data-testid={`timeline-event-${index}`}
                    >
                      {/* Ícone da timeline */}
                      <div className={cn(
                        "absolute left-0 w-12 h-12 rounded-full flex items-center justify-center border-2 bg-card",
                        config.color
                      )}>
                        <Icon className={cn("h-5 w-5", config.iconColor)} />
                      </div>

                      {/* Card do evento */}
                      <div
                        onClick={() => {
                          if (event.itemId) {
                            setLocation(`/eventos/${event.eventId}`);
                          } else if (event.eventId) {
                            setLocation(`/eventos/${event.eventId}`);
                          }
                        }}
                        className={cn(
                          "p-4 rounded-lg border cursor-pointer transition-all hover-elevate",
                          config.bgClass
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Badge variant="outline" className={cn("text-xs", config.color)}>
                                {config.label}
                              </Badge>
                              {event.userName && (
                                <span className="text-xs font-medium text-foreground">
                                  por {event.userName}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">• {timeAgo}</span>
                            </div>
                            <p className="text-sm text-foreground leading-relaxed">
                              {getEventDescription(event)}
                            </p>
                          </div>
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            {event.timestamp.toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
