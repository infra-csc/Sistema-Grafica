import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { Calendar, ClipboardList, Package, Building2, FileText, History, Edit, Save, X, Link2, Palette, CheckCircle, Zap, Eye, Cog, Check } from "lucide-react";
import { format } from "date-fns";
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

  // Timeline: mapeamento de status (valores reais do banco) → etapa ativa
  // -1 = nenhuma | 0 = Vinculação | 1 = Arte | 2 = Aprovação | 3 = Finalização | 4 = Revisão | 5 = Produção | 6 = tudo concluído
  const STATUS_STEP: Record<string, number> = {
    // Não iniciado
    requested: -1,
    draft: -1,
    // Vinculação ativa
    awaiting_linking: 0,
    // Arte ativa (Vinculação concluída)
    awaiting_submission: 1,
    // Aprovação ativa (Arte concluída)
    awaiting_approval: 2,
    awaiting_sponsor_approval: 2,
    // Finalização ativa (Aprovação concluída)
    awaiting_finalization: 3,
    sponsor_approved: 3,
    // Revisão ativa (Finalização concluída)
    awaiting_final_review: 4,
    awaiting_creator_review: 4,
    // Produção ativa (Revisão concluída)
    ready_for_production: 5,
    approved: 5,
    inproduction: 5,
    inProduction: 5,
    // Tudo concluído
    produced: 6,
    delivered: 6,
  };
  const rawStatus = (item.status || '').trim();
  const timelineCurrentStep = STATUS_STEP[rawStatus] ?? STATUS_STEP[rawStatus.toLowerCase()] ?? -1;

  const TIMELINE_STEPS = [
    { label: 'Vinculação', color: '#f97316', icon: Link2,       idx: 0 },
    { label: 'Arte',       color: '#a855f7', icon: Palette,     idx: 1 },
    { label: 'Aprovação',  color: '#f97316', icon: CheckCircle, idx: 2 },
    { label: 'Finalização',color: '#10b981', icon: Zap,         idx: 3 },
    { label: 'Revisão',    color: '#3b82f6', icon: Eye,         idx: 4 },
    { label: 'Produção',   color: '#10b981', icon: Cog,         idx: 5 },
  ];

  const handleEditChange = (field: string, value: any) => {
    setEditedItem((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSaveEdits = () => {
    if (onEditSave) {
      onEditSave(editedItem);
    }
    setEditMode(false);
  };

  // Mock histórico
  const mockHistory = [
    { action: 'Item criado', timestamp: '27/11/2025 08:00' },
    { action: 'Enviado para aprovação', timestamp: '27/11/2025 09:15' },
    { action: 'Aprovado', timestamp: '27/11/2025 10:30' },
    { action: 'Revisado', timestamp: '27/11/2025 11:45' },
    { action: 'Aguardando revisão final', timestamp: '27/11/2025 12:20' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-5xl max-h-[90vh] overflow-y-auto" 
        style={{ 
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '0',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)'
        }}
      >
        {/* Header */}
        <div style={{ 
          padding: '24px',
          borderBottom: '1px solid #e7e5e4'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ color: '#1c1917', fontSize: '18px', fontWeight: '700', margin: '0' }}>
                {item.displayId} • {item.event?.name}
              </h2>
            </div>
            <Button size="icon" variant="ghost" onClick={() => onOpenChange(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Timeline Horizontal */}
        <div style={{ padding: '16px 24px 12px 24px', borderBottom: '1px solid #e7e5e4' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            {TIMELINE_STEPS.map((step) => {
              const Icon = step.icon;
              const isDone    = step.idx < timelineCurrentStep;
              const isCurrent = step.idx === timelineCurrentStep;
              const isPending = step.idx > timelineCurrentStep;

              const circleBg    = isDone || isCurrent ? step.color : '#e7e5e4';
              const circleColor = isDone || isCurrent ? '#ffffff'  : '#a8a29e';
              const labelColor  = isPending ? '#c9c5c1' : '#78716c';
              const connectorBg = isDone ? step.color : '#e7e5e4';

              return (
                <div key={step.idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, position: 'relative' }}>
                  {/* Linha conectora */}
                  {step.idx < 5 && (
                    <div style={{
                      position: 'absolute',
                      top: '13px',
                      left: 'calc(50% + 14px)',
                      right: 'calc(-50% + 14px)',
                      height: '2px',
                      backgroundColor: connectorBg,
                      zIndex: 1,
                    }} />
                  )}

                  {/* Círculo */}
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: circleBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: circleColor,
                    marginBottom: '5px',
                    zIndex: 2,
                    position: 'relative',
                    flexShrink: 0,
                    boxShadow: isCurrent ? `0 0 0 3px ${step.color}33` : 'none',
                  }}>
                    {isDone
                      ? <Check size={13} strokeWidth={3} />
                      : <Icon size={13} strokeWidth={2} />
                    }
                  </div>

                  {/* Rótulo */}
                  <span style={{
                    fontSize: '10px',
                    fontWeight: isCurrent ? 700 : 400,
                    color: labelColor,
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                  }}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Status */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <StatusBadge status={item.status} />
            {item.rejectedBySponsor && (
              <Badge variant="outline" style={{ borderColor: '#ef4444', color: '#ef4444', fontSize: '11px' }}>
                Reprovado Patrocinador
              </Badge>
            )}
            {item.rejectedByCreator && (
              <Badge variant="outline" style={{ borderColor: '#f97316', color: '#f97316', fontSize: '11px' }}>
                Reprovado Criador
              </Badge>
            )}
          </div>

          {/* Descrição Card - MOST IMPORTANT */}
          {item.description && (
            <div style={{ 
              backgroundColor: '#fafaf9',
              border: '1px solid #e7e5e4',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <FileText className="h-5 w-5" style={{ color: '#f97316' }} />
                <h3 style={{ color: '#1c1917', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', margin: '0', letterSpacing: '0.5px' }}>
                  Descrição
                </h3>
              </div>
              <p style={{ color: '#1c1917', fontSize: '13px', whiteSpace: 'pre-wrap', margin: '0' }}>{item.description}</p>
            </div>
          )}

          {/* Grid: Evento + Especificações */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Evento Card */}
            <div style={{ 
              backgroundColor: '#fafaf9',
              border: '1px solid #e7e5e4',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Calendar className="h-5 w-5" style={{ color: '#f97316' }} />
                <h3 style={{ color: '#1c1917', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', margin: '0', letterSpacing: '0.5px' }}>
                  Evento
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #e7e5e4' }}>
                  <span style={{ color: '#a8a29e', fontSize: '12px' }}>Nome</span>
                  <span style={{ color: '#1c1917', fontWeight: '600', fontSize: '13px', textAlign: 'right' }}>{item.event?.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #e7e5e4' }}>
                  <span style={{ color: '#a8a29e', fontSize: '12px' }}>Data</span>
                  <span style={{ color: '#1c1917', fontWeight: '600', fontSize: '13px' }}>
                    {item.event?.startDate ? format(new Date(item.event.startDate), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0' }}>
                  <span style={{ color: '#a8a29e', fontSize: '12px' }}>Saída</span>
                  <span style={{ color: '#1c1917', fontWeight: '600', fontSize: '13px' }}>
                    {item.event?.truckDepartureDate ? format(new Date(item.event.truckDepartureDate), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Especificações Card */}
            <div style={{ 
              backgroundColor: '#fafaf9',
              border: '1px solid #e7e5e4',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ClipboardList className="h-5 w-5" style={{ color: '#f97316' }} />
                  <h3 style={{ color: '#1c1917', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', margin: '0', letterSpacing: '0.5px' }}>
                    Especificações
                  </h3>
                </div>
                {!editMode && (
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    onClick={() => { setEditedItem(item); setEditMode(true); }}
                    className="h-6 w-6"
                  >
                    <Edit className="h-4 w-4" style={{ color: '#1c1917' }} />
                  </Button>
                )}
              </div>
              {editMode ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={{ color: '#a8a29e', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Tipo</label>
                    <Input
                      value={editedItem?.type || ""}
                      onChange={(e) => handleEditChange("type", e.target.value)}
                      style={{ borderRadius: '6px', fontSize: '13px' }}
                      className="h-8"
                    />
                  </div>
                  <div>
                    <label style={{ color: '#a8a29e', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Material</label>
                    <Input
                      value={editedItem?.material || ""}
                      onChange={(e) => handleEditChange("material", e.target.value)}
                      style={{ borderRadius: '6px', fontSize: '13px' }}
                      className="h-8"
                    />
                  </div>
                  <div>
                    <label style={{ color: '#a8a29e', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Acabamento</label>
                    <Input
                      value={editedItem?.finish || ""}
                      onChange={(e) => handleEditChange("finish", e.target.value)}
                      style={{ borderRadius: '6px', fontSize: '13px' }}
                      className="h-8"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>Cancelar</Button>
                    <Button size="sm" onClick={handleSaveEdits}><Save className="h-3 w-3 mr-1" /> Salvar</Button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #e7e5e4' }}>
                    <span style={{ color: '#a8a29e', fontSize: '12px' }}>Tipo</span>
                    <span style={{ color: '#1c1917', fontWeight: '600', fontSize: '13px' }}>{item.type || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #e7e5e4' }}>
                    <span style={{ color: '#a8a29e', fontSize: '12px' }}>Material</span>
                    <span style={{ color: '#1c1917', fontWeight: '600', fontSize: '13px' }}>{item.material || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0' }}>
                    <span style={{ color: '#a8a29e', fontSize: '12px' }}>Acabamento</span>
                    <span style={{ color: '#1c1917', fontWeight: '600', fontSize: '13px' }}>{item.finish || '—'}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Dados de Produção Card */}
          <div style={{ 
            backgroundColor: '#fafaf9',
            border: '1px solid #e7e5e4',
            borderRadius: '12px',
            padding: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Package className="h-5 w-5" style={{ color: '#f97316' }} />
              <h3 style={{ color: '#1c1917', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', margin: '0', letterSpacing: '0.5px' }}>
                Dados de Produção
              </h3>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {/* Quantidade - com borda esquerda laranja */}
                <tr>
                  <td style={{ 
                    padding: '12px 16px',
                    borderLeft: '4px solid #f97316',
                    color: '#a8a29e',
                    fontSize: '12px',
                    fontWeight: '600',
                    width: '30%'
                  }}>
                    QUANTIDADE
                  </td>
                  <td style={{ 
                    padding: '12px 16px',
                    borderLeft: '4px solid #f97316',
                    color: '#1c1917',
                    fontSize: '14px',
                    fontWeight: '700'
                  }}>
                    {item.quantity || 0}
                  </td>
                </tr>
                
                {/* m² Total */}
                <tr>
                  <td style={{ 
                    padding: '12px 16px',
                    color: '#a8a29e',
                    fontSize: '12px',
                    fontWeight: '600',
                    width: '30%',
                    borderTop: '1px solid #e7e5e4',
                    borderBottom: '1px solid #e7e5e4'
                  }}>
                    M² TOTAL
                  </td>
                  <td style={{ 
                    padding: '12px 16px',
                    color: '#1c1917',
                    fontSize: '14px',
                    fontWeight: '600',
                    borderTop: '1px solid #e7e5e4',
                    borderBottom: '1px solid #e7e5e4'
                  }}>
                    {item.calculatedM2 || 0}
                  </td>
                </tr>
                
                {/* Visual */}
                <tr>
                  <td style={{ 
                    padding: '12px 16px',
                    color: '#a8a29e',
                    fontSize: '12px',
                    fontWeight: '600',
                    width: '30%',
                    borderBottom: '1px solid #e7e5e4'
                  }}>
                    VISUAL
                  </td>
                  <td style={{ 
                    padding: '12px 16px',
                    color: '#1c1917',
                    fontSize: '13px',
                    fontWeight: '600',
                    borderBottom: '1px solid #e7e5e4'
                  }}>
                    {item.visualWidth && item.visualHeight ? `${item.visualWidth} × ${item.visualHeight}` : '—'}
                  </td>
                </tr>

                {/* Arquivo */}
                {(item.fileWidth || item.fileHeight) && (
                  <tr>
                    <td style={{ 
                      padding: '12px 16px',
                      color: '#a8a29e',
                      fontSize: '12px',
                      fontWeight: '600',
                      width: '30%',
                      borderBottom: '1px solid #e7e5e4'
                    }}>
                      ARQUIVO
                    </td>
                    <td style={{ 
                      padding: '12px 16px',
                      color: '#1c1917',
                      fontSize: '13px',
                      fontWeight: '600',
                      borderBottom: '1px solid #e7e5e4'
                    }}>
                      {item.fileWidth && item.fileHeight ? `${item.fileWidth} × ${item.fileHeight}` : '—'}
                    </td>
                  </tr>
                )}
                
                {/* Medida */}
                <tr>
                  <td style={{ 
                    padding: '12px 16px',
                    color: '#a8a29e',
                    fontSize: '12px',
                    fontWeight: '600',
                    width: '30%',
                    borderTop: '1px solid #e7e5e4'
                  }}>
                    MEDIDA
                  </td>
                  <td style={{ 
                    padding: '12px 16px',
                    color: '#1c1917',
                    fontSize: '13px',
                    fontWeight: '600',
                    borderTop: '1px solid #e7e5e4'
                  }}>
                    {item.measurement || '—'}
                  </td>
                </tr>

                {/* Produzido */}
                {item.quantityProduced && (
                  <tr>
                    <td style={{ 
                      padding: '12px 16px',
                      color: '#a8a29e',
                      fontSize: '12px',
                      fontWeight: '600',
                      width: '30%',
                      borderTop: '1px solid #e7e5e4',
                      borderBottom: '1px solid #e7e5e4'
                    }}>
                      PRODUZIDO
                    </td>
                    <td style={{ 
                      padding: '12px 16px',
                      color: '#1c1917',
                      fontSize: '13px',
                      fontWeight: '600',
                      borderTop: '1px solid #e7e5e4',
                      borderBottom: '1px solid #e7e5e4'
                    }}>
                      {item.quantityProduced}
                    </td>
                  </tr>
                )}

                {/* Recebido por */}
                {item.receivedBy && (
                  <tr>
                    <td style={{ 
                      padding: '12px 16px',
                      color: '#a8a29e',
                      fontSize: '12px',
                      fontWeight: '600',
                      width: '30%',
                      borderTop: '1px solid #e7e5e4'
                    }}>
                      RECEBIDO POR
                    </td>
                    <td style={{ 
                      padding: '12px 16px',
                      color: '#1c1917',
                      fontSize: '13px',
                      fontWeight: '600',
                      borderTop: '1px solid #e7e5e4'
                    }}>
                      {item.receivedBy}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Datas Importantes Card */}
          {(item.approvedAt || item.productionStartedAt || item.producedAt || item.deliveredAt) && (
            <div style={{ 
              backgroundColor: '#fafaf9',
              border: '1px solid #e7e5e4',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Calendar className="h-5 w-5" style={{ color: '#f97316' }} />
                <h3 style={{ color: '#1c1917', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', margin: '0', letterSpacing: '0.5px' }}>
                  Datas Importantes
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {item.approvedAt && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #e7e5e4' }}>
                    <span style={{ color: '#a8a29e', fontSize: '12px' }}>Aprovado</span>
                    <span style={{ color: '#1c1917', fontWeight: '600', fontSize: '13px' }}>
                      {format(new Date(item.approvedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                )}
                {item.productionStartedAt && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #e7e5e4' }}>
                    <span style={{ color: '#a8a29e', fontSize: '12px' }}>Produção Iniciada</span>
                    <span style={{ color: '#1c1917', fontWeight: '600', fontSize: '13px' }}>
                      {format(new Date(item.productionStartedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                )}
                {item.producedAt && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #e7e5e4' }}>
                    <span style={{ color: '#a8a29e', fontSize: '12px' }}>Produzido</span>
                    <span style={{ color: '#1c1917', fontWeight: '600', fontSize: '13px' }}>
                      {format(new Date(item.producedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                )}
                {item.deliveredAt && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0' }}>
                    <span style={{ color: '#a8a29e', fontSize: '12px' }}>Entregue</span>
                    <span style={{ color: '#1c1917', fontWeight: '600', fontSize: '13px' }}>
                      {format(new Date(item.deliveredAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Custom Actions */}
          {customActions && (
            <div>
              {customActions}
            </div>
          )}

          {/* Top Actions */}
          {topActions && <div className="space-y-3">{topActions}</div>}

          {/* Patrocinadores */}
          {item.sponsors && item.sponsors.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Building2 className="h-5 w-5" style={{ color: '#f97316' }} />
                <h3 style={{ color: '#1c1917', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', margin: '0', letterSpacing: '0.5px' }}>
                  Patrocinadores
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {item.sponsors.map((sponsor: any) => (
                  <Badge 
                    key={sponsor.id} 
                    style={{ 
                      backgroundColor: sponsor.color || '#ffffff',
                      border: `1px solid ${sponsor.color || '#e7e5e4'}`,
                      color: '#ffffff',
                      padding: '6px 12px',
                      fontSize: '12px'
                    }}
                  >
                    {sponsor.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Observações */}
          {item.observations && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <FileText className="h-5 w-5" style={{ color: '#f97316' }} />
                <h3 style={{ color: '#1c1917', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', margin: '0', letterSpacing: '0.5px' }}>
                  Observações
                </h3>
              </div>
              <p style={{ color: '#1c1917', fontSize: '13px', whiteSpace: 'pre-wrap', margin: '0' }}>{item.observations}</p>
            </div>
          )}

          {/* Histórico Card */}
          {(() => {
            const ACTION_COLOR: Record<string, string> = {
              created:   '#f97316',
              updated:   '#3b82f6',
              approved:  '#10b981',
              delivered: '#10b981',
              rejected:  '#ef4444',
            };

            const itemLogs = auditLogs
              .filter((log: any) => log.entityId === item.id)
              .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

            const formatDate = (d: string) => {
              const dt = new Date(d);
              const day = dt.getDate().toString().padStart(2, '0');
              const mon = (dt.getMonth() + 1).toString().padStart(2, '0');
              const h   = dt.getHours().toString().padStart(2, '0');
              const min = dt.getMinutes().toString().padStart(2, '0');
              return `${day}/${mon} ${h}:${min}`;
            };

            return (
              <div style={{ backgroundColor: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: '12px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <History className="h-5 w-5" style={{ color: '#f97316' }} />
                  <h3 style={{ color: '#1c1917', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', margin: '0', letterSpacing: '0.5px' }}>
                    Histórico
                  </h3>
                </div>

                {itemLogs.length === 0 ? (
                  <p style={{ color: '#a8a29e', fontSize: '13px', margin: '0' }}>Nenhum registro encontrado.</p>
                ) : (
                  <div style={{ position: 'relative', paddingLeft: '28px' }}>
                    {/* Linha vertical */}
                    <div style={{ position: 'absolute', left: '6px', top: '0', bottom: '0', width: '1px', backgroundColor: '#e7e5e4' }} />

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {itemLogs.map((log: any, idx: number) => {
                        const color = ACTION_COLOR[log.action] ?? '#a8a29e';
                        return (
                          <div key={idx} style={{ position: 'relative' }}>
                            {/* Ponto colorido */}
                            <div style={{ position: 'absolute', left: '-22px', top: '3px', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: color }} />
                            {/* Rótulo = details ou action */}
                            <p style={{ color: '#1c1917', fontSize: '13px', fontWeight: '600', margin: '0 0 2px 0' }}>
                              {log.details || log.action}
                            </p>
                            <p style={{ color: '#a8a29e', fontSize: '12px', margin: '0' }}>
                              {formatDate(log.createdAt)}{log.userName ? ` · ${log.userName}` : ''}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
