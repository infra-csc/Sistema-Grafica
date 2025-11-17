import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Calendar, CheckCircle2, Package, Truck, Clock, User, MapPin } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Item } from "@shared/schema";

interface ItemTimelineDialogProps {
  item: Item | null;
  auditLogs: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    userName: string;
    details: string | null;
    createdAt: string;
  }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ItemTimelineDialog({ item, auditLogs, open, onOpenChange }: ItemTimelineDialogProps) {
  if (!item) return null;

  const itemLogs = auditLogs.filter(log => log.entityId === item.id).sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const createdLog = itemLogs.find(log => log.action === 'create_item');
  const approvedLog = itemLogs.find(log => log.action === 'approve_item');
  const producedLog = itemLogs.find(log => log.action === 'produce_item');
  const deliveredLog = itemLogs.find(log => log.action === 'deliver_item');

  const formatDateTime = (dateString: string) => {
    return format(new Date(dateString), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'requested': return 'bg-status-requested';
      case 'approved': return 'bg-status-approved';
      case 'inProduction': return 'bg-status-production';
      case 'produced': return 'bg-status-production';
      case 'delivered': return 'bg-status-completed';
      default: return 'bg-muted';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'requested': return 'Solicitado';
      case 'approved': return 'Liberado';
      case 'inProduction': return 'Em Produção';
      case 'produced': return 'Produzido';
      case 'delivered': return 'Entregue';
      default: return status;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Timeline do Item
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="bg-muted/50 p-4 rounded-lg space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-xs font-mono font-medium text-primary" data-testid="text-display-id">
                    {item.displayId}
                  </div>
                </div>
                <h3 className="font-semibold text-lg">{item.type}</h3>
                {item.description && (
                  <p className="text-sm text-muted-foreground mt-0.5">{item.description}</p>
                )}
                {item.material && (
                  <p className="text-sm text-muted-foreground mt-1">{item.material} {item.finish && `• ${item.finish}`}</p>
                )}
              </div>
              <Badge className={`${getStatusColor(item.status)} text-white flex-shrink-0`}>
                {getStatusLabel(item.status)}
              </Badge>
            </div>
            
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Quantidade:</span>{" "}
                <span className="font-medium">{item.quantity}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Área:</span>{" "}
                <span className="font-medium">{item.area} × {item.visual}</span>
              </div>
              {item.measurement && item.measurement !== `${item.area} × ${item.visual}` && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Medida:</span>{" "}
                  <span className="font-medium">{item.measurement}</span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">m²:</span>{" "}
                <span className="font-medium">{item.calculatedM2}</span>
              </div>
              {item.quantityProduced !== null && item.quantityProduced > 0 && (
                <div>
                  <span className="text-muted-foreground">Produzido:</span>{" "}
                  <span className="font-medium text-status-production">{item.quantityProduced}</span>
                </div>
              )}
            </div>

            {item.observations && (
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs text-muted-foreground">Observações:</p>
                <p className="text-sm">{item.observations}</p>
              </div>
            )}

            {item.receivedBy && (
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs text-muted-foreground">Recebido por:</p>
                <p className="text-sm font-medium">{item.receivedBy}</p>
              </div>
            )}

            {item.deliveryPhotoUrl && (
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs text-muted-foreground mb-2">Foto da Entrega:</p>
                <img 
                  src={item.deliveryPhotoUrl} 
                  alt="Foto de entrega" 
                  className="rounded-lg max-h-48 w-auto border border-border"
                />
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              Histórico de Ações
            </h4>
            
            <div className="relative space-y-4 pl-6">
              <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-border"></div>

              {(createdLog || item.createdAt) && (
                <div className="relative">
                  <div className="absolute -left-[1.6rem] top-1 h-6 w-6 rounded-full bg-status-pending flex items-center justify-center">
                    <Clock className="h-3 w-3 text-white" />
                  </div>
                  <div className="bg-card border border-border rounded-lg p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-status-pending/10 text-status-pending border-status-pending/20">
                          Criado
                        </Badge>
                        {createdLog && (
                          <>
                            <span className="text-xs text-muted-foreground">•</span>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <User className="h-3 w-3" />
                              <span>{createdLog.userName}</span>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{createdLog ? formatDateTime(createdLog.createdAt) : formatDateTime(new Date(item.createdAt).toISOString())}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {(approvedLog || item.approvedAt) && (
                <div className="relative">
                  <div className="absolute -left-[1.6rem] top-1 h-6 w-6 rounded-full bg-status-approved flex items-center justify-center">
                    <CheckCircle2 className="h-3 w-3 text-white" />
                  </div>
                  <div className="bg-card border border-border rounded-lg p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-status-approved/10 text-status-approved border-status-approved/20">
                          Liberado
                        </Badge>
                        {approvedLog && (
                          <>
                            <span className="text-xs text-muted-foreground">•</span>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <User className="h-3 w-3" />
                              <span>{approvedLog.userName}</span>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{approvedLog ? formatDateTime(approvedLog.createdAt) : formatDateTime(new Date(item.approvedAt!).toISOString())}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {(item.status === 'inProduction' || item.status === 'produced' || (item.status === 'delivered' && item.productionStartedAt)) && item.productionStartedAt && (
                <div className="relative">
                  <div className="absolute -left-[1.6rem] top-1 h-6 w-6 rounded-full bg-status-production flex items-center justify-center">
                    <Package className="h-3 w-3 text-white" />
                  </div>
                  <div className="bg-card border border-border rounded-lg p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="bg-status-production/10 text-status-production border-status-production/20">
                        Produção Iniciada
                      </Badge>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDateTime(new Date(item.productionStartedAt).toISOString())}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {((item.quantityProduced !== null && item.quantityProduced > 0) || item.status === 'produced' || item.status === 'delivered') && (
                <div className="relative">
                  <div className="absolute -left-[1.6rem] top-1 h-6 w-6 rounded-full bg-status-production flex items-center justify-center">
                    <CheckCircle2 className="h-3 w-3 text-white" />
                  </div>
                  <div className="bg-card border border-border rounded-lg p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-status-production/10 text-status-production border-status-production/20">
                          Produzido
                        </Badge>
                        {producedLog && (
                          <>
                            <span className="text-xs text-muted-foreground">•</span>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <User className="h-3 w-3" />
                              <span>{producedLog.userName}</span>
                            </div>
                          </>
                        )}
                      </div>
                      {(producedLog || item.producedAt || item.deliveredAt) && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>
                            {producedLog 
                              ? formatDateTime(producedLog.createdAt) 
                              : item.producedAt 
                                ? formatDateTime(new Date(item.producedAt).toISOString())
                                : formatDateTime(new Date(item.deliveredAt!).toISOString())
                            }
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {(deliveredLog || item.deliveredAt) && (
                <div className="relative">
                  <div className="absolute -left-[1.6rem] top-1 h-6 w-6 rounded-full bg-status-completed flex items-center justify-center">
                    <Truck className="h-3 w-3 text-white" />
                  </div>
                  <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-status-completed/10 text-status-completed border-status-completed/20">
                          Entregue
                        </Badge>
                        {deliveredLog && (
                          <>
                            <span className="text-xs text-muted-foreground">•</span>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <User className="h-3 w-3" />
                              <span>{deliveredLog.userName}</span>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{deliveredLog ? formatDateTime(deliveredLog.createdAt) : formatDateTime(new Date(item.deliveredAt!).toISOString())}</span>
                      </div>
                    </div>
                    {((deliveredLog?.details) || item.receivedBy) && (
                      <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border/50">
                        {(() => {
                          let recipientName = item.receivedBy;
                          if (deliveredLog?.details) {
                            try {
                              const details = JSON.parse(deliveredLog.details);
                              if (details.recipientName) {
                                recipientName = details.recipientName;
                              }
                            } catch {}
                          }
                          return recipientName ? (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              <span>Recebido por: <strong className="text-foreground">{recipientName}</strong></span>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {itemLogs.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma ação registrada ainda
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
