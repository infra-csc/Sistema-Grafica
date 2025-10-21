import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function Calendario() {
  const [currentDate, setCurrentDate] = useState(new Date());

  const { data: events = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const getEventStatus = (event: any) => {
    const now = new Date();
    const departure = new Date(event.truckDepartureDate);
    const hoursUntilDeparture = (departure.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (event.status === 'completed') return { status: 'completed', color: 'bg-status-completed', label: 'Finalizado' };
    if (hoursUntilDeparture < 48) return { status: 'urgent', color: 'bg-status-urgent', label: 'Urgente' };
    return { status: 'created', color: 'bg-status-pending', label: 'Criado' };
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
    return events.filter(event => {
      const departureDate = new Date(event.truckDepartureDate);
      return departureDate.toDateString() === date.toDateString();
    });
  };

  const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentDate);

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
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
          Visualize as datas de saída dos caminhões
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
                  className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide py-2"
                >
                  {day}
                </div>
              ))}
              {days.map((day, index) => {
                if (day === null) {
                  return <div key={`empty-${index}`} className="aspect-square" />;
                }

                const date = new Date(year, month, day);
                const eventsForDay = getEventsForDate(date);
                const isToday = date.toDateString() === new Date().toDateString();

                return (
                  <div
                    key={day}
                    className={cn(
                      "aspect-square p-2 border rounded-md hover-elevate cursor-pointer transition-all",
                      isToday && "border-primary border-2"
                    )}
                    data-testid={`calendar-day-${day}`}
                  >
                    <div className="flex flex-col h-full">
                      <span
                        className={cn(
                          "text-sm font-medium mb-1",
                          isToday && "text-primary"
                        )}
                      >
                        {day}
                      </span>
                      <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                        {eventsForDay.map((event) => {
                          const { color, label } = getEventStatus(event);
                          return (
                            <div
                              key={event.id}
                              className={cn(
                                "w-full h-1.5 rounded-full",
                                color
                              )}
                              title={`${event.name} - ${label}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Legenda</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-status-completed" />
              <span className="text-sm">Finalizado</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-status-pending" />
              <span className="text-sm">Criado</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-status-urgent" />
              <span className="text-sm">Urgente (&lt; 48h)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {events.filter(event => {
        const departure = new Date(event.truckDepartureDate);
        const now = new Date();
        const hoursUntilDeparture = (departure.getTime() - now.getTime()) / (1000 * 60 * 60);
        return hoursUntilDeparture > 0 && hoursUntilDeparture < 48;
      }).length > 0 && (
        <Card className="border-status-urgent">
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
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-md"
                      data-testid={`alert-${event.id}`}
                    >
                      <div>
                        <p className="font-medium text-sm">{event.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Saída: {departure.toLocaleDateString('pt-BR')} às {departure.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <Badge variant="destructive">
                        {hoursUntilDeparture}h restantes
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
