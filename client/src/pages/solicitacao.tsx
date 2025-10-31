import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Eye, Calendar, Truck, FileText, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const statusMap = {
  requested: { label: "Solicitado", color: "bg-blue-500" },
  awaiting_sponsor_approval: { label: "Aguardando Aprovação Patrocinador", color: "bg-yellow-500" },
  sponsor_approved: { label: "Aprovado pelo Patrocinador", color: "bg-purple-500" },
  awaiting_creator_review: { label: "Aguardando Revisão Criador", color: "bg-orange-500" },
  ready_for_production: { label: "Liberado para Produção", color: "bg-cyan-500" },
  approved: { label: "Aprovado", color: "bg-green-500" },
  inProduction: { label: "Em Produção", color: "bg-indigo-500" },
  produced: { label: "Produzido", color: "bg-teal-500" },
  delivered: { label: "Entregue", color: "bg-emerald-600" },
} as const;

export default function Solicitacao() {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: items = [], isLoading: itemsLoading } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const { data: sponsors = [] } = useQuery<any[]>({
    queryKey: ["/api/sponsors"],
  });

  const creatorReviewMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/creator-review`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setDialogOpen(false);
      setSelectedItem(null);
      toast({
        title: "Item liberado para produção",
        description: "O item foi revisado e liberado para a gráfica!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao liberar item",
        description: error.message || "Ocorreu um erro ao liberar o item",
        variant: "destructive",
      });
    },
  });

  const pendingItems = items.filter(item => item.status === 'sponsor_approved');

  const getEventInfo = (eventId: string) => {
    return events.find(e => e.id === eventId);
  };

  const getSponsorInfo = (sponsorId: string) => {
    return sponsors.find(s => s.id === sponsorId);
  };

  const handleViewDetails = (item: any) => {
    setSelectedItem(item);
    setDialogOpen(true);
  };

  const handleRelease = () => {
    if (selectedItem) {
      creatorReviewMutation.mutate(selectedItem.id);
    }
  };

  if (itemsLoading || eventsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Carregando itens...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-none p-6 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Revisão do Criador</h1>
            <p className="text-muted-foreground mt-1">
              Revise as aprovações dos patrocinadores e libere itens para produção
            </p>
          </div>
          <Card className="min-w-[200px]">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-4xl font-bold text-purple-600">
                  {pendingItems.length}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Aguardando Revisão
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {pendingItems.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
              <h3 className="text-xl font-semibold mb-2">Nenhum item para revisar</h3>
              <p className="text-muted-foreground text-center">
                Não há itens aprovados pelos patrocinadores aguardando sua revisão.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingItems.map((item) => {
              const event = getEventInfo(item.eventId);
              const sponsor = item.sponsorId ? getSponsorInfo(item.sponsorId) : null;
              
              return (
                <Card key={item.id} className="hover-elevate">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">{item.name}</CardTitle>
                        <p className="text-sm text-muted-foreground truncate">
                          {event?.name || "Evento desconhecido"}
                        </p>
                      </div>
                      <Badge variant="outline" className="flex-none">
                        {item.quantity}x
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {item.approvalThumbUrl && (
                      <div className="rounded-md overflow-hidden bg-muted">
                        <img
                          src={item.approvalThumbUrl}
                          alt="Thumb de aprovação"
                          className="w-full h-40 object-cover"
                        />
                      </div>
                    )}
                    
                    <div className="space-y-2 text-sm">
                      {sponsor && (
                        <div>
                          <span className="font-medium">Patrocinador:</span>{" "}
                          <span className="text-muted-foreground">{sponsor.name}</span>
                        </div>
                      )}
                      
                      {item.sponsorApprovedBy && (
                        <div className="flex items-center gap-2 text-green-600">
                          <Check className="w-4 h-4" />
                          <span>Aprovado por {item.sponsorApprovedBy}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      <span>
                        {event?.startDate
                          ? format(new Date(event.startDate), "dd 'de' MMMM", { locale: ptBR })
                          : "Data não definida"}
                      </span>
                    </div>

                    {event?.truckDepartureDate && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Truck className="w-4 h-4" />
                        <span>
                          Saída:{" "}
                          {format(new Date(event.truckDepartureDate), "dd/MM/yyyy HH:mm", {
                            locale: ptBR,
                          })}
                        </span>
                      </div>
                    )}

                    <Button
                      className="w-full"
                      onClick={() => handleViewDetails(item)}
                      data-testid={`button-view-${item.id}`}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Revisar e Liberar
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Revisão Final do Criador</DialogTitle>
            <DialogDescription>
              Revise todas as aprovações e libere o item para produção
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold mb-2">Informações do Item</h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium">Nome:</span>{" "}
                      <span className="text-muted-foreground">{selectedItem.name}</span>
                    </div>
                    <div>
                      <span className="font-medium">Tipo:</span>{" "}
                      <span className="text-muted-foreground">{selectedItem.type}</span>
                    </div>
                    <div>
                      <span className="font-medium">Quantidade:</span>{" "}
                      <span className="text-muted-foreground">{selectedItem.quantity}</span>
                    </div>
                    <div>
                      <span className="font-medium">Material:</span>{" "}
                      <span className="text-muted-foreground">{selectedItem.material || "N/A"}</span>
                    </div>
                    <div>
                      <span className="font-medium">Acabamento:</span>{" "}
                      <span className="text-muted-foreground">{selectedItem.finish || "N/A"}</span>
                    </div>
                    {selectedItem.sponsorId && (
                      <div>
                        <span className="font-medium">Patrocinador:</span>{" "}
                        <span className="text-muted-foreground">
                          {getSponsorInfo(selectedItem.sponsorId)?.name || "N/A"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Informações do Evento</h3>
                  <div className="space-y-2 text-sm">
                    {(() => {
                      const event = getEventInfo(selectedItem.eventId);
                      return event ? (
                        <>
                          <div>
                            <span className="font-medium">Evento:</span>{" "}
                            <span className="text-muted-foreground">{event.name}</span>
                          </div>
                          <div>
                            <span className="font-medium">Local:</span>{" "}
                            <span className="text-muted-foreground">{event.location}</span>
                          </div>
                          <div>
                            <span className="font-medium">Data:</span>{" "}
                            <span className="text-muted-foreground">
                              {format(new Date(event.startDate), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          </div>
                          {event.truckDepartureDate && (
                            <div>
                              <span className="font-medium">Saída do Caminhão:</span>{" "}
                              <span className="text-muted-foreground">
                                {format(new Date(event.truckDepartureDate), "dd/MM/yyyy HH:mm", {
                                  locale: ptBR,
                                })}
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-muted-foreground">Evento não encontrado</div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  Status de Aprovações
                </h3>
                <div className="space-y-2 text-sm">
                  {selectedItem.artApprovedBy && (
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" />
                      <span>
                        <span className="font-medium">Arte:</span> Aprovado por {selectedItem.artApprovedBy}
                        {selectedItem.artApprovedAt && (
                          <span className="text-muted-foreground ml-1">
                            em {format(new Date(selectedItem.artApprovedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  {selectedItem.sponsorApprovedBy && (
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" />
                      <span>
                        <span className="font-medium">Patrocinador:</span> Aprovado por {selectedItem.sponsorApprovedBy}
                        {selectedItem.sponsorApprovedAt && (
                          <span className="text-muted-foreground ml-1">
                            em {format(new Date(selectedItem.sponsorApprovedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {selectedItem.approvalThumbUrl && (
                <div>
                  <h3 className="font-semibold mb-2">Thumb de Aprovação</h3>
                  <div className="rounded-md overflow-hidden border">
                    <img
                      src={selectedItem.approvalThumbUrl}
                      alt="Thumb de aprovação"
                      className="w-full h-auto"
                    />
                  </div>
                </div>
              )}

              {selectedItem.finalFileUrl && (
                <div>
                  <h3 className="font-semibold mb-2">Arquivo Final</h3>
                  <a
                    href={selectedItem.finalFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-primary hover:underline"
                  >
                    <FileText className="w-4 h-4" />
                    Visualizar arquivo final
                  </a>
                </div>
              )}

              {selectedItem.notes && (
                <div>
                  <h3 className="font-semibold mb-2">Observações</h3>
                  <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                    {selectedItem.notes}
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              data-testid="button-cancel"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleRelease}
              disabled={creatorReviewMutation.isPending}
              data-testid="button-release"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {creatorReviewMutation.isPending ? "Liberando..." : "Liberar para Produção"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
