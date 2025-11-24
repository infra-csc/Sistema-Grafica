import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { CommentsSection } from "@/components/comments-section";
import { CheckCircle2, CircleDot, Circle, Calendar, ClipboardList, Package, Building2, FileText, History } from "lucide-react";
import { format, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ItemDetailsDialogProps {
  item: any | null;
  auditLogs?: any[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ItemDetailsDialog({ item, auditLogs = [], open, onOpenChange }: ItemDetailsDialogProps) {
  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle>Detalhes do Item</DialogTitle>
            <span className="text-sm font-mono font-medium text-primary">
              {item.displayId}
            </span>
            <StatusBadge status={item.status} />
          </div>
          <DialogDescription>
            Informações completas do item
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-2">
          {/* Barra de Progresso Visual */}
          <Card>
            <CardContent className="px-4 py-3">
              <div className="flex items-center justify-between text-xs">
                {/* Etapa 1: Vinculação */}
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className={`rounded-full p-1 ${
                    ['requested', 'awaiting_linking', 'awaiting_submission', 'awaiting_sponsor_approval', 'sponsor_approved', 'awaiting_approval', 'awaiting_finalization', 'awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered'].includes(item.status)
                      ? 'bg-orange-500 text-white' 
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                  }`}>
                    {['awaiting_submission', 'awaiting_sponsor_approval', 'sponsor_approved', 'awaiting_approval', 'awaiting_finalization', 'awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered'].includes(item.status) ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : ['requested', 'awaiting_linking'].includes(item.status) ? (
                      <CircleDot className="h-3 w-3" />
                    ) : (
                      <Circle className="h-3 w-3" />
                    )}
                  </div>
                  <span className={`text-center ${
                    ['requested', 'awaiting_linking'].includes(item.status) ? 'font-semibold text-orange-600 dark:text-orange-400' : 'text-muted-foreground'
                  }`}>
                    Vinculação
                  </span>
                </div>

                <div className={`h-[2px] flex-1 ${
                  ['awaiting_submission', 'awaiting_sponsor_approval', 'sponsor_approved', 'awaiting_approval', 'awaiting_finalization', 'awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered'].includes(item.status)
                    ? 'bg-orange-500' 
                    : 'bg-gray-200 dark:bg-gray-700'
                }`} />

                {/* Etapa 2: Arte */}
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className={`rounded-full p-1 ${
                    ['awaiting_submission', 'awaiting_sponsor_approval', 'sponsor_approved', 'awaiting_approval', 'awaiting_finalization', 'awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered'].includes(item.status)
                      ? 'bg-purple-500 text-white' 
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                  }`}>
                    {['awaiting_sponsor_approval', 'sponsor_approved', 'awaiting_approval', 'awaiting_finalization', 'awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered'].includes(item.status) ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : item.status === 'awaiting_submission' ? (
                      <CircleDot className="h-3 w-3" />
                    ) : (
                      <Circle className="h-3 w-3" />
                    )}
                  </div>
                  <span className={`text-center ${
                    item.status === 'awaiting_submission' ? 'font-semibold text-purple-600 dark:text-purple-400' : 'text-muted-foreground'
                  }`}>
                    Arte
                  </span>
                </div>

                <div className={`h-[2px] flex-1 ${
                  ['awaiting_sponsor_approval', 'sponsor_approved', 'awaiting_approval', 'awaiting_finalization', 'awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered'].includes(item.status)
                    ? 'bg-purple-500' 
                    : 'bg-gray-200 dark:bg-gray-700'
                }`} />

                {/* Etapa 3: Aprovação */}
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className={`rounded-full p-1 ${
                    ['awaiting_sponsor_approval', 'sponsor_approved', 'awaiting_approval', 'awaiting_finalization', 'awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered'].includes(item.status)
                      ? 'bg-amber-500 text-white' 
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                  }`}>
                    {['awaiting_finalization', 'awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered'].includes(item.status) ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : ['awaiting_sponsor_approval', 'sponsor_approved', 'awaiting_approval'].includes(item.status) ? (
                      <CircleDot className="h-3 w-3" />
                    ) : (
                      <Circle className="h-3 w-3" />
                    )}
                  </div>
                  <span className={`text-center ${
                    ['awaiting_sponsor_approval', 'sponsor_approved', 'awaiting_approval'].includes(item.status) ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                  }`}>
                    Aprovação
                  </span>
                </div>

                <div className={`h-[2px] flex-1 ${
                  ['awaiting_finalization', 'awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered'].includes(item.status)
                    ? 'bg-amber-500' 
                    : 'bg-gray-200 dark:bg-gray-700'
                }`} />

                {/* Etapa 4: Revisão */}
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className={`rounded-full p-1 ${
                    ['awaiting_finalization', 'awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered'].includes(item.status)
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                  }`}>
                    {['approved', 'inProduction', 'produced', 'delivered'].includes(item.status) ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : ['awaiting_finalization', 'awaiting_final_review', 'ready_for_production'].includes(item.status) ? (
                      <CircleDot className="h-3 w-3" />
                    ) : (
                      <Circle className="h-3 w-3" />
                    )}
                  </div>
                  <span className={`text-center ${
                    ['awaiting_finalization', 'awaiting_final_review', 'ready_for_production'].includes(item.status) ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-muted-foreground'
                  }`}>
                    Revisão
                  </span>
                </div>

                <div className={`h-[2px] flex-1 ${
                  ['approved', 'inProduction', 'produced', 'delivered'].includes(item.status)
                    ? 'bg-blue-500' 
                    : 'bg-gray-200 dark:bg-gray-700'
                }`} />

                {/* Etapa 5: Produção */}
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className={`rounded-full p-1 ${
                    ['approved', 'inProduction', 'produced', 'delivered'].includes(item.status)
                      ? 'bg-green-500 text-white' 
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                  }`}>
                    {item.status === 'delivered' ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : ['approved', 'inProduction', 'produced'].includes(item.status) ? (
                      <CircleDot className="h-3 w-3" />
                    ) : (
                      <Circle className="h-3 w-3" />
                    )}
                  </div>
                  <span className={`text-center ${
                    ['approved', 'inProduction', 'produced', 'delivered'].includes(item.status) ? 'font-semibold text-green-600 dark:text-green-400' : 'text-muted-foreground'
                  }`}>
                    Produção
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Grid 2 Colunas: Evento e Especificações */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {/* Informações do Evento */}
            <Card>
              <CardHeader className="px-4 py-2 bg-blue-50/50 dark:bg-blue-950/20">
                <CardTitle className="text-xs font-semibold uppercase text-blue-700 dark:text-blue-400 flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" />
                  Evento
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 py-2 pt-0 space-y-1.5 text-sm">
                <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                  <span className="text-muted-foreground text-xs">Nome do Evento</span>
                  <span className="font-semibold text-right">{item.event?.name}</span>
                </div>
                <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                  <span className="text-muted-foreground text-xs">Data de Início</span>
                  <span className="font-semibold">
                    {item.event?.startDate 
                      ? format(new Date(item.event.startDate), "dd/MM/yyyy", { locale: ptBR })
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between items-baseline py-1">
                  <span className="text-muted-foreground text-xs">Saída do Caminhão</span>
                  <span className="font-semibold">
                    {item.event?.truckDepartureDate 
                      ? format(new Date(item.event.truckDepartureDate), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                      : "—"}
                  </span>
                </div>
                {item.event?.truckDepartureDate && (() => {
                  const hoursUntilDeparture = differenceInHours(new Date(item.event.truckDepartureDate), new Date());
                  if (hoursUntilDeparture > 0 && hoursUntilDeparture < 48) {
                    const daysRemaining = Math.floor(hoursUntilDeparture / 24);
                    const hoursRemaining = hoursUntilDeparture % 24;
                    return (
                      <div className="pt-2 mt-1 border-t border-border/40">
                        <Badge variant="secondary" className="text-xs">
                          {daysRemaining > 0 ? `${daysRemaining}d ` : ''}{hoursRemaining}h restantes
                        </Badge>
                      </div>
                    );
                  }
                  return null;
                })()}
              </CardContent>
            </Card>

            {/* Especificações */}
            <Card>
              <CardHeader className="px-4 py-2 bg-purple-50/50 dark:bg-purple-950/20">
                <CardTitle className="text-xs font-semibold uppercase text-purple-700 dark:text-purple-400 flex items-center gap-2">
                  <ClipboardList className="h-3.5 w-3.5" />
                  Especificações
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 py-2 pt-0 space-y-1.5 text-sm">
                <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                  <span className="text-muted-foreground text-xs">Tipo</span>
                  <span className="font-semibold text-right">{item.type}</span>
                </div>
                <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                  <span className="text-muted-foreground text-xs">Material</span>
                  <span className="font-semibold text-right">{item.material}</span>
                </div>
                <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                  <span className="text-muted-foreground text-xs">Acabamento</span>
                  <span className="font-semibold text-right">{item.finish}</span>
                </div>
                <div className="flex justify-between items-baseline py-1">
                  <span className="text-muted-foreground text-xs">Descrição</span>
                  <span className="font-semibold text-right">{item.description || "—"}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Dados de Produção - Linha Inteira */}
          <Card>
            <CardHeader className="px-4 py-2 bg-emerald-50/50 dark:bg-emerald-950/20">
              <CardTitle className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <Package className="h-3.5 w-3.5" />
                Dados de Produção
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 py-2 pt-0 space-y-1.5 text-sm">
              <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                <span className="text-muted-foreground text-xs">Quantidade</span>
                <span className="font-semibold">{item.quantity}</span>
              </div>
              {(item.visualWidth && item.visualHeight) && (
                <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                  <span className="text-muted-foreground text-xs">Área × Visual</span>
                  <span className="font-semibold">{item.visualWidth} × {item.visualHeight}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                <span className="text-muted-foreground text-xs">m² Total</span>
                <span className="font-semibold">{item.calculatedM2}</span>
              </div>
              {item.measurement && (
                <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                  <span className="text-muted-foreground text-xs">Medida</span>
                  <span className="font-semibold">{item.measurement}</span>
                </div>
              )}
              {item.quantityProduced !== null && item.quantityProduced > 0 && (
                <div className="flex justify-between items-baseline py-1">
                  <span className="text-muted-foreground text-xs">Quantidade Produzida</span>
                  <span className="font-semibold text-status-production">{item.quantityProduced}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Patrocinadores */}
          {item.sponsors && item.sponsors.length > 0 && (
            <Card>
              <CardHeader className="px-4 py-2 bg-orange-50/50 dark:bg-orange-950/20">
                <CardTitle className="text-xs font-semibold uppercase text-orange-700 dark:text-orange-400 flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5" />
                  Patrocinadores ({item.sponsors.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 py-2 pt-0">
                <div className="flex flex-wrap gap-1.5">
                  {item.sponsors.map((sponsor: any) => (
                    <Badge key={sponsor.id} variant="outline" className="text-xs">
                      {sponsor.name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Observações */}
          {item.observations && (
            <Card>
              <CardHeader className="px-4 py-2 bg-amber-50/50 dark:bg-amber-950/20">
                <CardTitle className="text-xs font-semibold uppercase text-amber-700 dark:text-amber-400 flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5" />
                  Observações
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 py-2 pt-0">
                <p className="text-sm whitespace-pre-wrap">{item.observations}</p>
              </CardContent>
            </Card>
          )}

          {/* Histórico de Ações */}
          <Card>
            <CardHeader className="px-4 py-2 bg-slate-50/50 dark:bg-slate-950/20">
              <CardTitle className="text-xs font-semibold uppercase text-slate-700 dark:text-slate-400 flex items-center gap-2">
                <History className="h-3.5 w-3.5" />
                Histórico de Ações
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 py-2 pt-0">
              <div className="relative">
                {auditLogs.filter((log: any) => log.entityId === item.id).length > 0 ? (
                  <div className="space-y-3">
                    {auditLogs
                      .filter((log: any) => log.entityId === item.id)
                      .sort((a: any, b: any) => {
                        const dateA = new Date(a.createdAt || a.timestamp).getTime();
                        const dateB = new Date(b.createdAt || b.timestamp).getTime();
                        return dateB - dateA;
                      })
                      .map((log: any, index: number, array: any[]) => {
                        const timestamp = log.createdAt || log.timestamp;
                        const actionLabels: Record<string, string> = {
                          'created': 'Criado',
                          'updated': 'Atualizado',
                          'approved': 'Aprovado',
                          'rejected': 'Rejeitado',
                          'delivered': 'Entregue',
                          'linked': 'Vinculado',
                          'unlinked': 'Desvinculado',
                          'status_changed': 'Status Alterado',
                          'sponsor_linked': 'Patrocinador Vinculado',
                          'sponsor_unlinked': 'Patrocinador Desvinculado'
                        };
                        const actionLabel = actionLabels[log.action] || log.action;

                        return (
                          <div key={log.id} className="relative flex gap-3">
                            {index < array.length - 1 && (
                              <div className="absolute left-2 top-6 bottom-0 w-px bg-border"></div>
                            )}
                            
                            <div className="flex-shrink-0 w-4 h-4 rounded-full bg-primary/20 ring-2 ring-primary mt-0.5"></div>
                            
                            <div className="flex-1 pb-2">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="secondary" className="text-xs font-medium">
                                  {actionLabel}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  por {log.userName}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {timestamp 
                                  ? format(new Date(timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                                  : "Sem registro de horário"}
                              </div>
                              {log.details && (
                                <p className="text-sm mt-1.5 text-foreground/80">{log.details}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum histórico disponível</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Comentários */}
          <div className="border-t pt-4">
            <CommentsSection itemId={item.id} itemType={item.type} />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
