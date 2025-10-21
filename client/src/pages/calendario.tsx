import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, AlertCircle, Calendar, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function Calendario() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [, setLocation] = useLocation();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: events = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  // Status para DATA DO EVENTO (startDate)
  const getEventStartStatus = (event: any) => {
    const now = new Date();
    const start = new Date(event.startDate);
    const hoursUntilStart = (start.getTime() - now.getTime()) / (1000 * 60 * 60);

    // Verde: Evento já passou ou finalizado
    if (event.status === 'completed' || hoursUntilStart < 0) {
      return { 
        status: 'completed', 
        color: 'bg-status-completed/20', 
        textColor: 'text-status-completed', 
        borderColor: 'border-status-completed',
        label: hoursUntilStart < 0 ? 'Realizado' : 'Finalizado' 
      };
    }
    
    // Vermelho: Menos de 24h para início
    if (hoursUntilStart < 24) {
      return { 
        status: 'critical', 
        color: 'bg-status-urgent/20', 
        textColor: 'text-status-urgent',
        borderColor: 'border-status-urgent',
        label: 'Início em menos de 24h' 
      };
    }
    
    // Amarelo: Entre 24h e 48h para início
    if (hoursUntilStart < 48) {
      return { 
        status: 'warning', 
        color: 'bg-status-pending/20', 
        textColor: 'text-status-pending',
        borderColor: 'border-status-pending',
        label: 'Início em menos de 48h' 
      };
    }
    
    // Azul: Mais de 48h para início
    return { 
      status: 'normal', 
      color: 'bg-status-approved/20', 
      textColor: 'text-status-approved',
      borderColor: 'border-status-approved',
      label: 'Início em mais de 48h' 
    };
  };

  // Status para SAÍDA DO CAMINHÃO (truckDepartureDate)
  const getTruckDepartureStatus = (event: any) => {
    const now = new Date();
    const departure = new Date(event.truckDepartureDate);
    const hoursUntilDeparture = (departure.getTime() - now.getTime()) / (1000 * 60 * 60);

    // Verde: Caminhão já saiu ou evento finalizado
    if (event.status === 'completed' || hoursUntilDeparture < 0) {
      return { 
        status: 'completed', 
        color: 'bg-status-completed/20', 
        textColor: 'text-status-completed', 
        borderColor: 'border-status-completed',
        label: hoursUntilDeparture < 0 ? 'Concluído' : 'Finalizado' 
      };
    }
    
    // Vermelho: Menos de 24h para saída
    if (hoursUntilDeparture < 24) {
      return { 
        status: 'critical', 
        color: 'bg-status-urgent/20', 
        textColor: 'text-status-urgent',
        borderColor: 'border-status-urgent',
        label: 'Saída em menos de 24h' 
      };
    }
    
    // Amarelo: Entre 24h e 48h para saída
    if (hoursUntilDeparture < 48) {
      return { 
        status: 'warning', 
        color: 'bg-status-pending/20', 
        textColor: 'text-status-pending',
        borderColor: 'border-status-pending',
        label: 'Saída em menos de 48h' 
      };
    }
    
    // Azul: Mais de 48h para saída
    return { 
      status: 'normal', 
      color: 'bg-status-approved/20', 
      textColor: 'text-status-approved',
      borderColor: 'border-status-approved',
      label: 'Saída em mais de 48h' 
    };
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    // Ajuste para começar na segunda-feira (0=domingo vira 6, 1=segunda vira 0)
    const startingDayOfWeek = (firstDay.getDay() + 6) % 7;

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

  // Semana começando na SEGUNDA-FEIRA (domingo no final - padrão brasileiro)
  const weekDays = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
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
                const hasEvents = eventsForDay.length > 0;

                return (
                  <div
                    key={day}
                    onClick={() => {
                      if (hasEvents) {
                        setSelectedDate(date);
                        setIsDialogOpen(true);
                      }
                    }}
                    className={cn(
                      "min-h-[120px] p-2 border rounded-md transition-all",
                      isToday && "border-primary border-2 bg-primary/5",
                      !isToday && !hasEvents && "border-border",
                      !isToday && hasEvents && "border-border hover:border-primary/50 hover:shadow-sm cursor-pointer"
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
                      
                      <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                        {eventsForDay.slice(0, 3).map((eventData) => {
                          const isStart = eventData.type === 'start';
                          // Status diferente para cada tipo de data
                          const { color, borderColor } = isStart 
                            ? getEventStartStatus(eventData) 
                            : getTruckDepartureStatus(eventData);
                          const Icon = isStart ? Calendar : Truck;
                          const time = isStart 
                            ? new Date(eventData.startDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                            : new Date(eventData.truckDepartureDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                          
                          return (
                            <div
                              key={`${eventData.id}-${eventData.type}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setLocation(`/eventos/${eventData.id}`);
                              }}
                              className={cn(
                                "flex items-start gap-1 px-1.5 py-1 rounded text-[10px] cursor-pointer transition-all hover-elevate border-l-2",
                                borderColor,
                                color
                              )}
                              title={`${isStart ? '📅 Início' : '🚚 Saída'}: ${eventData.name} - ${time}`}
                              data-testid={`event-${eventData.id}-${eventData.type}`}
                            >
                              <Icon className="h-2.5 w-2.5 shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium leading-tight truncate">{time}</div>
                                <div className="leading-tight truncate opacity-90">{eventData.name}</div>
                              </div>
                            </div>
                          );
                        })}
                        {eventsForDay.length > 3 && (
                          <div className="text-[10px] text-muted-foreground text-center py-0.5">
                            +{eventsForDay.length - 3}
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
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground mb-1">
                Cada data tem seu próprio status baseado no prazo:
              </p>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded bg-status-completed shrink-0" />
                <span className="text-sm font-medium text-status-completed">Verde:</span>
                <span className="text-sm">Realizado ou finalizado</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded bg-status-approved shrink-0" />
                <span className="text-sm font-medium text-status-approved">Azul:</span>
                <span className="text-sm">Mais de 48h restantes</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded bg-status-pending shrink-0" />
                <span className="text-sm font-medium text-status-pending">Amarelo:</span>
                <span className="text-sm">Entre 24h e 48h</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded bg-status-urgent shrink-0" />
                <span className="text-sm font-medium text-status-urgent">Vermelho:</span>
                <span className="text-sm">Menos de 24h</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modal de Eventos do Dia */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Eventos de {selectedDate?.toLocaleDateString('pt-BR', { 
                weekday: 'long', 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            {selectedDate && getEventsForDate(selectedDate).map((eventData) => {
              const isStart = eventData.type === 'start';
              // Status diferente para cada tipo de data
              const { color, textColor, borderColor, label } = isStart 
                ? getEventStartStatus(eventData) 
                : getTruckDepartureStatus(eventData);
              const Icon = isStart ? Calendar : Truck;
              const dateTime = isStart 
                ? new Date(eventData.startDate)
                : new Date(eventData.truckDepartureDate);
              
              return (
                <div
                  key={`${eventData.id}-${eventData.type}`}
                  onClick={() => {
                    setIsDialogOpen(false);
                    setLocation(`/eventos/${eventData.id}`);
                  }}
                  className={cn(
                    "flex items-start gap-3 p-4 rounded-lg cursor-pointer transition-all hover-elevate border-l-4",
                    borderColor,
                    color
                  )}
                  data-testid={`dialog-event-${eventData.id}-${eventData.type}`}
                >
                  <div className={cn("p-2 rounded-md", color)}>
                    <Icon className={cn("h-5 w-5", textColor)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-base text-foreground">{eventData.name}</h3>
                      <Badge 
                        variant="outline"
                        className={cn(
                          "shrink-0 font-medium",
                          borderColor
                        )}
                      >
                        {label}
                      </Badge>
                    </div>
                    <div className="mt-1 space-y-1 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        {isStart ? (
                          <>
                            <Calendar className="h-3.5 w-3.5" />
                            <span>Início do evento: {dateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                          </>
                        ) : (
                          <>
                            <Truck className="h-3.5 w-3.5" />
                            <span>Saída do caminhão: {dateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                          </>
                        )}
                      </div>
                      <div className="text-xs">
                        Período: {new Date(eventData.startDate).toLocaleDateString('pt-BR')} até {new Date(eventData.truckDepartureDate).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {selectedDate && getEventsForDate(selectedDate).length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum evento neste dia
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
