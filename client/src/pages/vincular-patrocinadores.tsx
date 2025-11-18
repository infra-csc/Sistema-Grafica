import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function VincularPatrocinadores() {
  const { data: items = [], isLoading: itemsLoading } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const { data: sponsors = [], isLoading: sponsorsLoading } = useQuery<any[]>({
    queryKey: ["/api/sponsors"],
  });

  if (itemsLoading || eventsLoading || sponsorsLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Carregando...</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Aguarde...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Vincular Patrocinadores - Teste Minimal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <strong>Total de Items:</strong> {items.length}
            </div>
            <div>
              <strong>Total de Eventos:</strong> {events.length}
            </div>
            <div>
              <strong>Total de Patrocinadores:</strong> {sponsors.length}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
