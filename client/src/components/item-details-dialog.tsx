import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import { CommentsSection } from "@/components/comments-section";
import { CheckCircle2, CircleDot, Circle, Calendar, ClipboardList, Package, Building2, FileText, History, PlusCircle, Edit, XCircle, Link, Unlink, ArrowRightCircle, Send, Save } from "lucide-react";
import { format, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";

interface ItemDetailsDialogProps {
  item: any | null;
  auditLogs?: any[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customActions?: React.ReactNode;
  topActions?: React.ReactNode;
  onEditSave?: (editedItem: any) => void;
}

export function ItemDetailsDialog({ item, auditLogs = [], open, onOpenChange, customActions, topActions, onEditSave }: ItemDetailsDialogProps) {
  const [editMode, setEditMode] = useState(false);
  const [editedItem, setEditedItem] = useState(item);

  if (!item) return null;

  const handleEditChange = (field: string, value: any) => {
    setEditedItem((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSaveEdits = () => {
    if (onEditSave) {
      onEditSave(editedItem);
    }
    setEditMode(false);
  };

  const getActionIconAndColor = (action: string) => {
    const config: Record<string, { icon: any; bgColor: string; ringColor: string; badgeVariant?: "default" | "secondary" | "destructive" | "outline"; badgeClasses?: string }> = {
      'created': { 
        icon: PlusCircle, 
        bgColor: 'bg-green-500/20 dark:bg-green-500/30', 
        ringColor: 'ring-green-500',
        badgeVariant: 'default'
      },
      'updated': { 
        icon: Edit, 
        bgColor: 'bg-primary/20 dark:bg-primary/30', 
        ringColor: 'ring-primary',
        badgeVariant: 'outline',
        badgeClasses: 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary border-primary'
      },
      'approved': { 
        icon: CheckCircle2, 
        bgColor: 'bg-green-500/20 dark:bg-green-500/30', 
        ringColor: 'ring-green-500',
        badgeVariant: 'default'
      },
      'rejected': { 
        icon: XCircle, 
        bgColor: 'bg-red-500/20 dark:bg-red-500/30', 
        ringColor: 'ring-red-500',
        badgeVariant: 'destructive'
      },
      'delivered': { 
        icon: Package, 
        bgColor: 'bg-emerald-600/20 dark:bg-emerald-600/30', 
        ringColor: 'ring-emerald-600',
        badgeVariant: 'default'
      },
      'linked': { 
        icon: Link, 
        bgColor: 'bg-cyan-500/20 dark:bg-cyan-500/30', 
        ringColor: 'ring-cyan-500',
        badgeVariant: 'secondary'
      },
      'unlinked': { 
        icon: Unlink, 
        bgColor: 'bg-orange-500/20 dark:bg-orange-500/30', 
        ringColor: 'ring-orange-500',
        badgeVariant: 'outline'
      },
      'status_changed': { 
        icon: ArrowRightCircle, 
        bgColor: 'bg-purple-500/20 dark:bg-purple-500/30', 
        ringColor: 'ring-purple-500',
        badgeVariant: 'secondary'
      },
      'sponsor_linked': { 
        icon: Link, 
        bgColor: 'bg-cyan-500/20 dark:bg-cyan-500/30', 
        ringColor: 'ring-cyan-500',
        badgeVariant: 'secondary'
      },
      'sponsor_unlinked': { 
        icon: Unlink, 
        bgColor: 'bg-orange-500/20 dark:bg-orange-500/30', 
        ringColor: 'ring-orange-500',
        badgeVariant: 'outline'
      },
      'sent': { 
        icon: Send, 
        bgColor: 'bg-indigo-500/20 dark:bg-indigo-500/30', 
        ringColor: 'ring-indigo-500',
        badgeVariant: 'secondary'
      }
    };
    
    return config[action] || {
      icon: Circle,
      bgColor: 'bg-gray-500/20 dark:bg-gray-500/30',
      ringColor: 'ring-gray-500',
      badgeVariant: 'secondary'
    };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#fafaf9', border: '1px solid #e7e5e4' }}>
        <DialogHeader style={{ backgroundColor: '#f5f4f3', borderBottom: '1px solid #e7e5e4', paddingBottom: '20px', paddingTop: '20px', marginBottom: '0' }}>
          <div className="w-full space-y-3">
            {/* ID e Subtitle em linha */}
            <div className="flex items-baseline gap-3">
              <span style={{ fontSize: '20px', fontWeight: '700', color: '#1c1917', fontFamily: 'monospace', letterSpacing: '1px' }}>
                {item.displayId}
              </span>
              <p style={{ fontSize: '11px', color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: '600' }}>
                Detalhes do Item
              </p>
            </div>
            {/* Status e Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={item.status} />
              {item.rejectedBySponsor && (
                <Badge 
                  variant="outline" 
                  className="text-xs border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400"
                  data-testid="badge-rejected-sponsor"
                >
                  Reprovado Patrocinador
                </Badge>
              )}
              {item.rejectedByCreator && (
                <Badge 
                  variant="outline" 
                  className="text-xs border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-400"
                  data-testid="badge-rejected-creator"
                >
                  Reprovado Criador
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Barra de Progresso Visual - 6 Etapas */}
          <Card style={{ backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: '10px' }}>
            <CardHeader style={{ backgroundColor: '#f5f4f3', borderBottom: '1px solid #e7e5e4', borderRadius: '10px 10px 0 0' }} className="px-4 py-2">
              <CardTitle style={{ color: '#78716c', fontSize: '12px' }} className="font-semibold uppercase flex items-center gap-2">
                <ArrowRightCircle className="h-3.5 w-3.5" />
                Progresso
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 py-4">
              {(() => {
                const steps = [
                  { 
                    id: 'vinculacao', 
                    label: 'Vinculação', 
                    color: 'orange',
                    activeStatuses: ['requested', 'awaiting_linking'],
                    completedStatuses: ['awaiting_submission', 'awaiting_sponsor_approval', 'sponsor_approved', 'awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered']
                  },
                  { 
                    id: 'arte', 
                    label: 'Arte', 
                    color: 'purple',
                    activeStatuses: ['awaiting_submission'],
                    completedStatuses: ['awaiting_sponsor_approval', 'sponsor_approved', 'awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered']
                  },
                  { 
                    id: 'aprovacao', 
                    label: 'Aprovação', 
                    color: 'amber',
                    activeStatuses: ['awaiting_sponsor_approval'],
                    completedStatuses: ['sponsor_approved', 'awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered']
                  },
                  { 
                    id: 'finalizacao', 
                    label: 'Finalização', 
                    color: 'green',
                    activeStatuses: ['sponsor_approved'],
                    completedStatuses: ['awaiting_final_review', 'ready_for_production', 'approved', 'inProduction', 'produced', 'delivered']
                  },
                  { 
                    id: 'revisao', 
                    label: 'Revisão', 
                    color: 'blue',
                    activeStatuses: ['awaiting_final_review', 'ready_for_production'],
                    completedStatuses: ['approved', 'inProduction', 'produced', 'delivered']
                  },
                  { 
                    id: 'producao', 
                    label: 'Produção', 
                    color: 'emerald',
                    activeStatuses: ['approved', 'inProduction', 'produced'],
                    completedStatuses: ['delivered']
                  }
                ];

                const colorClasses: Record<string, { bg: string; text: string; line: string }> = {
                  orange: { bg: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400', line: 'bg-orange-500' },
                  purple: { bg: 'bg-purple-500', text: 'text-purple-600 dark:text-purple-400', line: 'bg-purple-500' },
                  amber: { bg: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', line: 'bg-amber-500' },
                  green: { bg: 'bg-green-500', text: 'text-green-600 dark:text-green-400', line: 'bg-green-500' },
                  blue: { bg: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400', line: 'bg-blue-500' },
                  emerald: { bg: 'bg-emerald-600', text: 'text-emerald-600 dark:text-emerald-400', line: 'bg-emerald-600' }
                };

                return (
                  <div className="flex items-center justify-between text-xs">
                    {steps.map((step, index) => {
                      const isActive = step.activeStatuses.includes(item.status);
                      const isCompleted = step.completedStatuses.includes(item.status);
                      const isReached = isActive || isCompleted;
                      const colors = colorClasses[step.color];

                      return (
                        <div key={step.id} className="contents">
                          <div className="flex flex-col items-center gap-1 flex-1">
                            <div className={`rounded-full p-1 ${
                              isReached ? `${colors.bg} text-white` : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                            }`}>
                              {isCompleted ? (
                                <CheckCircle2 className="h-3 w-3" />
                              ) : isActive ? (
                                <CircleDot className="h-3 w-3" />
                              ) : (
                                <Circle className="h-3 w-3" />
                              )}
                            </div>
                            <span className={`text-center leading-tight ${
                              isActive ? `font-semibold ${colors.text}` : 'text-muted-foreground'
                            }`}>
                              {step.label}
                            </span>
                          </div>
                          {index < steps.length - 1 && (
                            <div className={`h-[2px] flex-1 ${
                              step.completedStatuses.includes(item.status) ? colors.line : 'bg-gray-200 dark:bg-gray-700'
                            }`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Ações Customizadas - Logo após Timeline (Upload de Thumb, etc) */}
          {customActions && (
            <div className="bg-white border border-[#e7e5e4] rounded-[10px] p-4">
              {customActions}
            </div>
          )}

          {/* Ações no Topo - Prioridade (ex: Finalização de Layout) */}
          {topActions && (
            <div className="space-y-3">
              {topActions}
            </div>
          )}

          {/* Grid 2 Colunas: Evento e Especificações */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Informações do Evento */}
            <Card style={{ backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: '10px' }}>
              <CardHeader style={{ backgroundColor: '#f5f4f3', borderBottom: '1px solid #e7e5e4', borderRadius: '10px 10px 0 0' }} className="px-4 py-2">
                <CardTitle style={{ color: '#78716c', fontSize: '12px' }} className="font-semibold uppercase flex items-center gap-2">
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
            <Card style={{ backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: '10px' }}>
              <CardHeader style={{ backgroundColor: '#f5f4f3', borderBottom: '1px solid #e7e5e4', borderRadius: '10px 10px 0 0' }} className="px-4 py-2 flex flex-row items-center justify-between gap-2">
                <CardTitle style={{ color: '#78716c', fontSize: '12px' }} className="font-semibold uppercase flex items-center gap-2">
                  <ClipboardList className="h-3.5 w-3.5" />
                  Especificações
                </CardTitle>
                {!editMode && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setEditedItem(item);
                      setEditMode(true);
                    }}
                    data-testid="button-edit-mode"
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                )}
              </CardHeader>
              <CardContent className="px-4 py-2 pt-0 space-y-1.5 text-sm">
                {editMode ? (
                  <>
                    <div className="py-2 space-y-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Tipo</label>
                        <Input
                          value={editedItem?.type || ""}
                          onChange={(e) => handleEditChange("type", e.target.value)}
                          className="text-sm"
                          data-testid="input-edit-type"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Material</label>
                        <Input
                          value={editedItem?.material || ""}
                          onChange={(e) => handleEditChange("material", e.target.value)}
                          className="text-sm"
                          data-testid="input-edit-material"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Acabamento</label>
                        <Input
                          value={editedItem?.finish || ""}
                          onChange={(e) => handleEditChange("finish", e.target.value)}
                          className="text-sm"
                          data-testid="input-edit-finish"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Descrição</label>
                        <Textarea
                          value={editedItem?.description || ""}
                          onChange={(e) => handleEditChange("description", e.target.value)}
                          className="text-sm min-h-16"
                          data-testid="textarea-edit-description"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2 border-t">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditMode(false)}
                        data-testid="button-edit-cancel"
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveEdits}
                        data-testid="button-edit-save"
                      >
                        <Save className="h-3 w-3 mr-1" />
                        Salvar Edições
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                      <span className="text-muted-foreground text-xs">Tipo</span>
                      <span className="font-semibold text-right">{editedItem?.type || item?.type}</span>
                    </div>
                    <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                      <span className="text-muted-foreground text-xs">Material</span>
                      <span className="font-semibold text-right">{editedItem?.material || item?.material}</span>
                    </div>
                    <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                      <span className="text-muted-foreground text-xs">Acabamento</span>
                      <span className="font-semibold text-right">{editedItem?.finish || item?.finish}</span>
                    </div>
                    <div className="flex justify-between items-baseline py-1">
                      <span className="text-muted-foreground text-xs">Descrição</span>
                      <span className="font-semibold text-right">{editedItem?.description || item?.description || "—"}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Separator com margin */}
          <div style={{ height: '1px', backgroundColor: '#e7e5e4' }} />

          {/* Dados de Produção - Linha Inteira */}
          <Card style={{ backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: '10px' }}>
            <CardHeader style={{ backgroundColor: '#f5f4f3', borderBottom: '1px solid #e7e5e4', borderRadius: '10px 10px 0 0' }} className="px-4 py-2 flex flex-row items-center justify-between gap-2">
              <CardTitle style={{ color: '#78716c', fontSize: '12px' }} className="font-semibold uppercase flex items-center gap-2">
                <Package className="h-3.5 w-3.5" />
                Dados de Produção
              </CardTitle>
              {!editMode && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setEditedItem(item);
                    setEditMode(true);
                  }}
                  data-testid="button-edit-production"
                >
                  <Edit className="h-3.5 w-3.5" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="px-4 py-2 pt-0 space-y-1.5 text-sm">
              {editMode ? (
                <>
                  <div className="py-2 space-y-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Quantidade</label>
                      <Input
                        type="number"
                        value={editedItem?.quantity || ""}
                        onChange={(e) => handleEditChange("quantity", parseInt(e.target.value) || 0)}
                        className="text-sm"
                        data-testid="input-edit-quantity"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">m² Total</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={editedItem?.calculatedM2 || ""}
                        onChange={(e) => handleEditChange("calculatedM2", parseFloat(e.target.value) || 0)}
                        className="text-sm"
                        data-testid="input-edit-m2"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Medida</label>
                      <Input
                        value={editedItem?.measurement || ""}
                        onChange={(e) => handleEditChange("measurement", e.target.value)}
                        className="text-sm"
                        placeholder="Ex: 1.90 × 0.90"
                        data-testid="input-edit-measurement"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                    <span className="text-muted-foreground text-xs">Quantidade</span>
                    <span className="font-semibold">{editedItem?.quantity || item.quantity}</span>
                  </div>
                  {(item.visualWidth && item.visualHeight) && (
                    <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                      <span className="text-muted-foreground text-xs">Área × Visual</span>
                      <span className="font-semibold">{item.visualWidth} × {item.visualHeight}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                    <span className="text-muted-foreground text-xs">m² Total</span>
                    <span className="font-semibold">{editedItem?.calculatedM2 || item.calculatedM2}</span>
                  </div>
                  {(editedItem?.measurement || item.measurement) && (
                    <div className="flex justify-between items-baseline py-1 border-b border-border/40">
                      <span className="text-muted-foreground text-xs">Medida</span>
                      <span className="font-semibold">{editedItem?.measurement || item.measurement}</span>
                    </div>
                  )}
                  {item.quantityProduced !== null && item.quantityProduced > 0 && (
                    <div className="flex justify-between items-baseline py-1">
                      <span className="text-muted-foreground text-xs">Quantidade Produzida</span>
                      <span className="font-semibold text-status-production">{item.quantityProduced}</span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Separator */}
          <div style={{ height: '1px', backgroundColor: '#e7e5e4' }} />

          {/* Patrocinadores */}
          {item.sponsors && item.sponsors.length > 0 && (
            <Card style={{ backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: '10px' }}>
              <CardHeader style={{ backgroundColor: '#f5f4f3', borderBottom: '1px solid #e7e5e4', borderRadius: '10px 10px 0 0' }} className="px-4 py-2">
                <CardTitle style={{ color: '#78716c', fontSize: '12px' }} className="font-semibold uppercase flex items-center gap-2">
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

          {/* Separator */}
          <div style={{ height: '1px', backgroundColor: '#e7e5e4' }} />

          {/* Observações */}
          {item.observations && (
            <Card style={{ backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: '10px' }}>
              <CardHeader style={{ backgroundColor: '#f5f4f3', borderBottom: '1px solid #e7e5e4', borderRadius: '10px 10px 0 0' }} className="px-4 py-2">
                <CardTitle style={{ color: '#78716c', fontSize: '12px' }} className="font-semibold uppercase flex items-center gap-2">
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
          <Card style={{ backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: '10px' }}>
            <CardHeader style={{ backgroundColor: '#f5f4f3', borderBottom: '1px solid #e7e5e4', borderRadius: '10px 10px 0 0' }} className="px-4 py-2">
              <CardTitle style={{ color: '#78716c', fontSize: '12px' }} className="font-semibold uppercase flex items-center gap-2">
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
                          'sponsor_unlinked': 'Patrocinador Desvinculado',
                          'sent': 'Enviado'
                        };
                        const actionLabel = actionLabels[log.action] || log.action;
                        const { icon: ActionIcon, bgColor, ringColor, badgeVariant, badgeClasses } = getActionIconAndColor(log.action);

                        return (
                          <div key={log.id} className="relative flex gap-3">
                            {index < array.length - 1 && (
                              <div className="absolute left-2 top-6 bottom-0 w-px bg-border"></div>
                            )}
                            
                            <div className={`flex-shrink-0 w-4 h-4 rounded-full ring-2 mt-0.5 flex items-center justify-center ${bgColor} ${ringColor}`}>
                              <ActionIcon className="h-2.5 w-2.5" />
                            </div>
                            
                            <div className="flex-1 pb-2">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant={badgeVariant} className={`text-xs font-medium ${badgeClasses || ''}`}>
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
