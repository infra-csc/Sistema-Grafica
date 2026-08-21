import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Calendar, CheckCircle2, Package, Truck, Clock, User, MapPin, PlusCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Item } from "@shared/schema";
import { getStatusLabel } from "@/lib/status";

// Complemento: aumento de quantidade pedido DEPOIS que a peça entrou em
// produção. A peça original nunca muda — a diferença vira uma peça-filha
// (#0062-C1) com ciclo próprio. Aqui a trilha precisa contar os dois lados:
// na filha, de quem ela é complemento e por quê; na mãe, que ela ganhou um.
const COMPLEMENT_ACTIONS = ["complement_created", "complement_canceled"];
// Tokens da família laranja de lib/status.ts. #f97316 só como fundo/bolinha —
// nunca como cor de texto (regra da casa).
const CO = { bg: "#fff7ed", border: "#fed7aa", text: "#c2410c", textStrong: "#7c2d12", dot: "#f97316" };

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
  // Eventos avulsos (não são etapas do fluxo, mas fazem parte da história da
  // peça): criação e cancelamento de complemento, gravados tanto na mãe quanto
  // na filha. Sem isto, a trilha de #0062 não diria NADA sobre o aumento.
  const complementLogs = itemLogs.filter(log => COMPLEMENT_ACTIONS.includes(log.action));

  // O enrich das rotas de leitura anexa `parent` na filha e `complements` na
  // mãe; nenhum dos dois está no tipo Item (são derivados a cada leitura, nunca
  // colunas). O fallback tira o sufixo do próprio displayId.
  const parentDisplayId = (item as any).parent?.displayId
    ?? String(item.displayId ?? "").replace(/-C\d+$/i, "");
  const complements: any[] = (item as any).complements ?? [];
  const complementsQty = complements.reduce((s, c) => s + (Number(c?.quantity) || 0), 0);

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
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <div className="text-xs font-mono font-medium text-primary" data-testid="text-display-id">
                    {item.displayId}
                  </div>
                  {/* Identidade permanente do complemento — fica mesmo depois de
                      entregue, ao contrário do realce laranja da fila. */}
                  {item.parentItemId && (
                    <span
                      data-testid="badge-complemento"
                      style={{ backgroundColor: CO.bg, color: CO.text, border: `1px solid ${CO.border}`, borderRadius: 6, padding: "1px 7px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}
                    >
                      Complemento de {parentDisplayId}
                    </span>
                  )}
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
                {/* O par NOVO primeiro, o velho como reserva.

                    `area`/`visual` são as colunas originais da medida
                    visual e `visual_width`/`visual_height` vieram depois —
                    quatro colunas para dois números. O servidor agora as
                    mantém juntas, mas as peças editadas ANTES disso ficaram
                    com o par velho congelado, e era ele que esta linha
                    imprimia. Lendo o novo primeiro, elas leem certo mesmo
                    sem passar pelo script de correção. */}
                <span className="font-medium">
                  {(item.visualWidth ?? item.area)} × {(item.visualHeight ?? item.visual)}
                </span>
              </div>
              {/* A comparação usa o mesmo par que a linha acima imprime —
                  antes ela media `measurement` contra as colunas velhas,
                  ou seja, dois campos que derivavam separado: bastava um
                  dos dois envelhecer para a linha "Medida" aparecer ou
                  sumir sem nada ter mudado na peça. */}
              {item.measurement && item.measurement !== `${item.visualWidth ?? item.area} × ${item.visualHeight ?? item.visual}` && (
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

            {/* FILHA — por que este lote existe, quem pediu e quando. */}
            {item.parentItemId && item.complementReason && (
              <div className="pt-2 border-t border-border/50">
                <div style={{ backgroundColor: CO.bg, border: `1px solid ${CO.border}`, borderRadius: 8, padding: "8px 10px", display: "flex", gap: 7, alignItems: "flex-start" }}>
                  <PlusCircle style={{ width: 13, height: 13, color: CO.text, flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 13, color: CO.textStrong, lineHeight: 1.4 }}>
                    <strong>
                      Aumento pedido{item.complementRequestedBy ? ` por ${item.complementRequestedBy}` : ""}
                    </strong>
                    {item.complementRequestedAt ? ` (${formatDateTime(new Date(item.complementRequestedAt).toISOString())})` : ""}: {item.complementReason}
                  </span>
                </div>
              </div>
            )}

            {/* MÃE — os complementos que nasceram dela. A quantidade da mãe NÃO
                muda nunca; o total contratado só existe derivado, somando as
                linhas (contador denormalizado sempre acaba divergindo). */}
            {complements.length > 0 && (
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs text-muted-foreground mb-1">Complementos desta peça:</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {complements.map((c: any) => (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13, color: CO.textStrong }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, color: CO.text }}>{c.displayId}</span>
                      <span style={{ fontWeight: 700 }}>+{c.quantity} un.</span>
                      <span className="text-muted-foreground">{getStatusLabel(c.status)}</span>
                      {c.complementReason && <span className="text-muted-foreground">· {c.complementReason}</span>}
                    </div>
                  ))}
                </div>
                <p style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: CO.textStrong }}>
                  Contratado total: {(Number(item.quantity) || 0) + complementsQty} un. ({item.quantity} + {complementsQty})
                </p>
              </div>
            )}

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
                            } catch (error) {
                              console.warn("Failed to parse delivery log details JSON", error);
                            }
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

              {/* Complemento criado / cancelado. As etapas acima são fixas e
                  casam por ação exata; estes eventos não são etapas do fluxo —
                  entram como registros avulsos, no mesmo molde, com o texto do
                  próprio log (que já traz quantidade, total contratado e
                  motivo). Serve a qualquer ação futura fora das etapas. */}
              {complementLogs.map(log => (
                <div className="relative" key={log.id}>
                  <div className="absolute -left-[1.6rem] top-1 h-6 w-6 rounded-full flex items-center justify-center" style={{ backgroundColor: CO.dot }}>
                    <PlusCircle className="h-3 w-3 text-white" />
                  </div>
                  <div className="bg-card border border-border rounded-lg p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" style={{ backgroundColor: CO.bg, color: CO.text, borderColor: CO.border }}>
                          {log.action === "complement_canceled" ? "Complemento cancelado" : "Complemento"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">•</span>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span>{log.userName}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDateTime(log.createdAt)}</span>
                      </div>
                    </div>
                    {log.details && (
                      <p className="text-sm" style={{ color: CO.textStrong }}>{log.details}</p>
                    )}
                  </div>
                </div>
              ))}

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
