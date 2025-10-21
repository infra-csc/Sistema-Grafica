import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, AlertCircle, Calendar, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

export default function Calendario() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [, setLocation] = useLocation();

  const { data: events = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const getEventStatus = (event: any) => {
    const now = new Date();
    const departure = new Date(event.truckDepartureDate);
    const hoursUntilDeparture = (departure.getTime() - now.getTime()) / (1000 * 60 * 60);

    // Verde: Evento finalizado ou já passou
    if (event.status === 'completed' || hoursUntilDeparture < 0) {
      return { 
        status: 'completed', 
        color: 'bg-status-completed', 
        textColor: 'text-status-completed', 
        borderColor: 'border-status-completed',
        label: hoursUntilDeparture < 0 ? 'Concluído' : 'Finalizado' 
      };
    }
    
    // Vermelho: Menos de 24h para saída
    if (hoursUntilDeparture < 24) {
      return { 
        status: 'critical', 
        color: 'bg-status-urgent', 
        textColor: 'text-status-urgent',
        borderColor: 'border-status-urgent',
        label: 'Crítico (< 24h)' 
      };
    }
    
    // Amarelo: Entre 24h e 48h para saída
    if (hoursUntilDeparture < 48) {
      return { 
        status: 'warning', 
        color: 'bg-status-pending', 
        textColor: 'text-status-pending',
        borderColor: 'border-status-pending',
        label: 'Atenção (< 48h)' 
      };
    }
    
    // Azul: Mais de 48h, em andamento normal
    return { 
      status: 'normal', 
      color: 'bg-status-approved', 
      textColor: 'text-status-approved',
      borderColor: 'border-status-approved',
      label: 'Em andamento' 
    };
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const getEventsForDate = (date: Date) => {
    const dateStr = date.toDateString();
    
    const eventStarts = events
      .filter(event => new Date(event.startDate).toDateString() === dateStr)
      .map(event => ({ ...event, type: 'start' }));
    
    const eventDepartures = events
      .filter(event => new Date(event.truckDepartureDate).toDateString() === dateStr)
      .map(event => ({ ...event, type: 'departure' }));
    
    return [...eventStarts, ...eventDepartures];
  };

  const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentDate);

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const weekDays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const days = [];
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="title-calendario">
          Calendário de Eventos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Visualize os eventos e datas de saída dos caminhões
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              {monthNames[month]} {year}
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={previousMonth} data-testid="button-prev-month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={nextMonth} data-testid="button-next-month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((day) => (
                <div
                  key={day}
                  className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide py-2 bg-muted/30 rounded-md"
                >
                  {day}
                </div>
              ))}
              {days.map((day, index) => {
                if (day === null) {
                  return <div key={`empty-${index}`} className="min-h-[120px]" />;
                }

                const date = new Date(year, month, day);
                const eventsForDay = getEventsForDate(date);
                const isToday = date.toDateString() === new Date().toDateString();

                return (
                  <div
                    key={day}
                    className={cn(
                      "min-h-[120px] p-2 border rounded-md transition-all",
                      isToday ? "border-primary border-2 bg-primary/5" : "border-border hover:border-primary/50 hover:shadow-sm"
                    )}
                    data-testid={`calendar-day-${day}`}
                  >
                    <div className="flex flex-col h-full">
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            isToday ? "text-primary" : "text-foreground"
                          )}
                        >
                          {day}
                        </span>
                        {eventsForDay.length > 0 && (
                          <Badge variant="secondary" className="text-xs px-1.5 py-0">
                            {eventsForDay.length}
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex-1 flex flex-col gap-1.5 overflow-auto">
                        {eventsForDay.slice(0, 5).map((eventData) => {
                          const { color, textColor, borderColor } = getEventStatus(eventData);
                          const isStart = eventData.type === 'start';
                          const Icon = isStart ? Calendar : Truck;
                          
                          return (
                            <div
                              key={`${eventData.id}-${eventData.type}`}
                              onClick={() => setLocation(`/eventos/${eventData.id}`)}
                              className={cn(
                                "flex items-center gap-1.5 p-1.5 rounded-md text-xs cursor-pointer transition-all hover-elevate border-l-2",
                                color,
                                borderColor,
                                "bg-opacity-20 hover:bg-opacity-30"
                              )}
                              title={`${isStart ? '📅 Início' : '🚚 Saída'}: ${eventData.name}`}
                              data-testid={`event-${eventData.id}-${eventData.type}`}
                            >
                              <Icon className={cn("h-3 w-3 shrink-0", textColor)} />
                              <span className={cn("truncate font-medium leading-tight", textColor)}>
                                {eventData.name}
                              </span>
                            </div>
                          );
                        })}
                        {eventsForDay.length > 5 && (
                          <div className="text-xs text-muted-foreground text-center py-1">
                            +{eventsForDay.length - 5} mais
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Legenda - Tipo de Data</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm">Início do Evento</span>
              </div>
              <div className="flex items-center gap-3">
                <Truck className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm">Saída do Caminhão</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Legenda - Status por Prazo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded bg-status-completed shrink-0" />
                <span className="text-sm font-medium text-status-completed">Verde:</span>
                <span className="text-sm">Evento finalizado ou já passou</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded bg-status-approved shrink-0" />
                <span className="text-sm font-medium text-status-approved">Azul:</span>
                <span className="text-sm">Mais de 48h para saída</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded bg-status-pending shrink-0" />
                <span className="text-sm font-medium text-status-pending">Amarelo:</span>
                <span className="text-sm">Faltam entre 24h e 48h</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded bg-status-urgent shrink-0" />
                <span className="text-sm font-medium text-status-urgent">Vermelho:</span>
                <span className="text-sm">Crítico - Menos de 24h!</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {events.filter(event => {
        const departure = new Date(event.truckDepartureDate);
        const now = new Date();
        const hoursUntilDeparture = (departure.getTime() - now.getTime()) / (1000 * 60 * 60);
        return hoursUntilDeparture > 0 && hoursUntilDeparture < 48;
      }).length > 0 && (
        <Card className="border-status-urgent border-l-4">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-status-urgent" />
              <CardTitle>Alertas de Prazo</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {events
                .filter(event => {
                  const departure = new Date(event.truckDepartureDate);
                  const now = new Date();
                  const hoursUntilDeparture = (departure.getTime() - now.getTime()) / (1000 * 60 * 60);
                  return hoursUntilDeparture > 0 && hoursUntilDeparture < 48;
                })
                .map(event => {
                  const departure = new Date(event.truckDepartureDate);
                  const now = new Date();
                  const hoursUntilDeparture = Math.floor((departure.getTime() - now.getTime()) / (1000 * 60 * 60));

                  return (
                    <div
                      key={event.id}
                      onClick={() => setLocation(`/eventos/${event.id}`)}
                      className="flex items-center justify-between p-3 bg-status-urgent/10 rounded-md cursor-pointer hover-elevate"
                      data-testid={`alert-${event.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <Truck className="h-5 w-5 text-status-urgent shrink-0" />
                        <div>
                          <p className="font-medium text-sm">{event.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Saída: {departure.toLocaleDateString('pt-BR')} às {departure.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <Badge variant="destructive" className="shrink-0">
                        {hoursUntilDeparture}h
                      </Badge>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
