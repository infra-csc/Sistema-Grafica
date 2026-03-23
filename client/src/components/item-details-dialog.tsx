import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import { CommentsSection } from "@/components/comments-section";
import { CheckCircle2, CircleDot, Circle, Calendar, ClipboardList, Package, Building2, FileText, History, Edit, Save, X, Check, AlertCircle } from "lucide-react";
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

  // Mock histórico detalhado
  const mockHistory = [
    { action: 'Item criado', user: 'Sistema', timestamp: '27/11/2025 08:00', icon: CheckCircle2, color: '#10b981' },
    { action: 'Enviado para aprovação de patrocinador', user: 'Sistema', timestamp: '27/11/2025 09:15', icon: AlertCircle, color: '#f59e0b' },
    { action: 'Aprovado por patrocinador', user: 'Sistema', timestamp: '27/11/2025 10:30', icon: Check, color: '#10b981' },
    { action: 'Item revisado e ajustado', user: 'Sistema', timestamp: '27/11/2025 11:45', icon: Edit, color: '#3b82f6' },
    { action: 'Aguardando revisão final do criador', user: 'Sistema', timestamp: '27/11/2025 12:20', icon: AlertCircle, color: '#a855f7' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-5xl max-h-[90vh] overflow-y-auto" 
        style={{ 
          backgroundColor: '#ffffff',
          border: '1px solid #e7e5e4',
          borderRadius: '16px',
          padding: '0'
        }}
      >
        {/* Header */}
        <div style={{ 
          backgroundColor: '#fafaf9',
          borderBottom: '1px solid #e7e5e4',
          padding: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '16px 16px 0 0'
        }}>
          <div>
            <h2 style={{ color: '#1c1917', fontSize: '18px', fontWeight: '700', margin: '0' }}>
              {item.displayId} • {item.event?.name}
            </h2>
          </div>
          <Button size="icon" variant="ghost" onClick={() => onOpenChange(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Timeline Horizontal */}
        <div style={{ 
          backgroundColor: '#fafaf9',
          borderBottom: '1px solid #e7e5e4',
          padding: '20px 24px',
          overflowX: 'auto'
        }}>
          <div style={{ display: 'flex', gap: '12px', minWidth: 'fit-content' }}>
            {['Criado', 'Em Aprovação', 'Aprovado', 'Pronto', 'Aguardando Revisão'].map((step, idx) => (
              <Badge 
                key={idx}
                style={{
                  backgroundColor: item.status === 'awaiting_final_review' && idx === 4 ? '#a855f7' : '#ffffff',
                  color: item.status === 'awaiting_final_review' && idx === 4 ? '#ffffff' : '#1c1917',
                  border: item.status === 'awaiting_final_review' && idx === 4 ? '1px solid #a855f7' : '1px solid #e7e5e4',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: '600',
                  whiteSpace: 'nowrap'
                }}
              >
                {step}
              </Badge>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Status Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <StatusBadge status={item.status} />
            {item.rejectedBySponsor && (
              <Badge variant="outline" className="text-xs" style={{ borderColor: '#ef4444', color: '#ef4444' }}>
                Reprovado Patrocinador
              </Badge>
            )}
            {item.rejectedByCreator && (
              <Badge variant="outline" className="text-xs" style={{ borderColor: '#f97316', color: '#f97316' }}>
                Reprovado Criador
              </Badge>
            )}
          </div>

          {/* Grid: Evento + Especificações */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            {/* Evento */}
            <div style={{ 
              backgroundColor: '#fafaf9',
              border: '1px solid #e7e5e4',
              borderRadius: '12px',
              padding: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Calendar className="h-5 w-5" style={{ color: '#f97316' }} />
                <h3 style={{ color: '#1c1917', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', margin: '0', letterSpacing: '0.5px' }}>
                  Evento
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ color: '#a8a29e', fontSize: '12px' }}>Nome</span>
                  <span style={{ color: '#1c1917', fontWeight: '600', fontSize: '14px', textAlign: 'right' }}>{item.event?.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ color: '#a8a29e', fontSize: '12px' }}>Data de Início</span>
                  <span style={{ color: '#1c1917', fontWeight: '600', fontSize: '14px' }}>
                    {item.event?.startDate ? format(new Date(item.event.startDate), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ color: '#a8a29e', fontSize: '12px' }}>Saída Caminhão</span>
                  <span style={{ color: '#1c1917', fontWeight: '600', fontSize: '14px' }}>
                    {item.event?.truckDepartureDate ? format(new Date(item.event.truckDepartureDate), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Especificações */}
            <div style={{ 
              backgroundColor: '#fafaf9',
              border: '1px solid #e7e5e4',
              borderRadius: '12px',
              padding: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ClipboardList className="h-5 w-5" style={{ color: '#f97316' }} />
                  <h3 style={{ color: '#1c1917', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', margin: '0', letterSpacing: '0.5px' }}>
                    Especificações
                  </h3>
                </div>
                {!editMode && (
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    onClick={() => { setEditedItem(item); setEditMode(true); }}
                    className="h-8 w-8"
                  >
                    <Edit className="h-4 w-4" style={{ color: '#1c1917' }} />
                  </Button>
                )}
              </div>
              {editMode ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ color: '#a8a29e', fontSize: '12px', display: 'block', marginBottom: '6px' }}>Tipo</label>
                    <Input
                      value={editedItem?.type || ""}
                      onChange={(e) => handleEditChange("type", e.target.value)}
                      style={{ borderRadius: '8px' }}
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <label style={{ color: '#a8a29e', fontSize: '12px', display: 'block', marginBottom: '6px' }}>Material</label>
                    <Input
                      value={editedItem?.material || ""}
                      onChange={(e) => handleEditChange("material", e.target.value)}
                      style={{ borderRadius: '8px' }}
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <label style={{ color: '#a8a29e', fontSize: '12px', display: 'block', marginBottom: '6px' }}>Acabamento</label>
                    <Input
                      value={editedItem?.finish || ""}
                      onChange={(e) => handleEditChange("finish", e.target.value)}
                      style={{ borderRadius: '8px' }}
                      className="text-sm"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>Cancelar</Button>
                    <Button size="sm" onClick={handleSaveEdits}><Save className="h-3 w-3 mr-1" /> Salvar</Button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ color: '#a8a29e', fontSize: '12px' }}>Tipo</span>
                    <span style={{ color: '#1c1917', fontWeight: '600', fontSize: '14px' }}>{item.type || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ color: '#a8a29e', fontSize: '12px' }}>Material</span>
                    <span style={{ color: '#1c1917', fontWeight: '600', fontSize: '14px' }}>{item.material || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ color: '#a8a29e', fontSize: '12px' }}>Acabamento</span>
                    <span style={{ color: '#1c1917', fontWeight: '600', fontSize: '14px' }}>{item.finish || '—'}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Dados de Produção - Grid 4 Cards */}
          <div style={{ 
            backgroundColor: '#fafaf9',
            border: '1px solid #e7e5e4',
            borderRadius: '12px',
            padding: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Package className="h-5 w-5" style={{ color: '#f97316' }} />
              <h3 style={{ color: '#1c1917', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', margin: '0', letterSpacing: '0.5px' }}>
                Dados de Produção
              </h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '16px' }}>
              {/* Quantidade */}
              <div style={{ 
                backgroundColor: '#ffffff',
                border: '2px solid #f97316',
                borderRadius: '10px',
                padding: '12px',
                textAlign: 'center'
              }}>
                <p style={{ color: '#a8a29e', fontSize: '11px', textTransform: 'uppercase', margin: '0 0 6px 0', fontWeight: '600', letterSpacing: '0.4px' }}>Quantidade</p>
                <p style={{ color: '#f97316', fontSize: '28px', fontWeight: '700', margin: '0' }}>{item.quantity || 0}</p>
              </div>

              {/* m² Total */}
              <div style={{ 
                backgroundColor: '#ffffff',
                border: '1px solid #e7e5e4',
                borderRadius: '10px',
                padding: '12px',
                textAlign: 'center'
              }}>
                <p style={{ color: '#a8a29e', fontSize: '11px', textTransform: 'uppercase', margin: '0 0 6px 0', fontWeight: '600', letterSpacing: '0.4px' }}>m² Total</p>
                <p style={{ color: '#1c1917', fontSize: '24px', fontWeight: '700', margin: '0' }}>{item.calculatedM2 || 0}</p>
              </div>

              {/* Visual */}
              <div style={{ 
                backgroundColor: '#ffffff',
                border: '1px solid #e7e5e4',
                borderRadius: '10px',
                padding: '12px',
                textAlign: 'center'
              }}>
                <p style={{ color: '#a8a29e', fontSize: '11px', textTransform: 'uppercase', margin: '0 0 6px 0', fontWeight: '600', letterSpacing: '0.4px' }}>Visual</p>
                <p style={{ color: '#1c1917', fontSize: '14px', fontWeight: '600', margin: '0' }}>
                  {item.visualWidth && item.visualHeight ? `${item.visualWidth} × ${item.visualHeight}` : '—'}
                </p>
              </div>

              {/* Medida */}
              <div style={{ 
                backgroundColor: '#ffffff',
                border: '1px solid #e7e5e4',
                borderRadius: '10px',
                padding: '12px',
                textAlign: 'center'
              }}>
                <p style={{ color: '#a8a29e', fontSize: '11px', textTransform: 'uppercase', margin: '0 0 6px 0', fontWeight: '600', letterSpacing: '0.4px' }}>Medida</p>
                <p style={{ color: '#1c1917', fontSize: '14px', fontWeight: '600', margin: '0' }}>{item.measurement || '—'}</p>
              </div>
            </div>
          </div>

          {/* Custom Actions */}
          {customActions && (
            <div style={{ 
              backgroundColor: '#fafaf9',
              border: '1px solid #e7e5e4',
              borderRadius: '12px',
              padding: '20px'
            }}>
              {customActions}
            </div>
          )}

          {/* Top Actions */}
          {topActions && <div className="space-y-3">{topActions}</div>}

          {/* Patrocinadores */}
          {item.sponsors && item.sponsors.length > 0 && (
            <div style={{ 
              backgroundColor: '#fafaf9',
              border: '1px solid #e7e5e4',
              borderRadius: '12px',
              padding: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Building2 className="h-5 w-5" style={{ color: '#f97316' }} />
                <h3 style={{ color: '#1c1917', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', margin: '0', letterSpacing: '0.5px' }}>
                  Patrocinadores
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {item.sponsors.map((sponsor: any) => (
                  <Badge 
                    key={sponsor.id} 
                    style={{ 
                      backgroundColor: '#ffffff',
                      border: '1px solid #e7e5e4',
                      color: '#1c1917',
                      padding: '6px 12px'
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
            <div style={{ 
              backgroundColor: '#fafaf9',
              border: '1px solid #e7e5e4',
              borderRadius: '12px',
              padding: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <FileText className="h-5 w-5" style={{ color: '#f97316' }} />
                <h3 style={{ color: '#1c1917', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', margin: '0', letterSpacing: '0.5px' }}>
                  Observações
                </h3>
              </div>
              <p style={{ color: '#1c1917', fontSize: '14px', whiteSpace: 'pre-wrap', margin: '0' }}>{item.observations}</p>
            </div>
          )}

          {/* Histórico - Timeline Vertical Detalhada */}
          <div style={{ 
            backgroundColor: '#fafaf9',
            border: '1px solid #e7e5e4',
            borderRadius: '12px',
            padding: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <History className="h-5 w-5" style={{ color: '#f97316' }} />
              <h3 style={{ color: '#1c1917', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', margin: '0', letterSpacing: '0.5px' }}>
                Histórico
              </h3>
            </div>
            
            {/* Timeline Vertical */}
            <div style={{ position: 'relative', paddingLeft: '32px' }}>
              {/* Linha vertical */}
              <div style={{ 
                position: 'absolute',
                left: '12px',
                top: '0',
                bottom: '0',
                width: '1px',
                backgroundColor: '#e7e5e4'
              }} />
              
              {/* Eventos */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {mockHistory.map((event, idx) => (
                  <div key={idx} style={{ position: 'relative' }}>
                    {/* Ponto da timeline */}
                    <div style={{ 
                      position: 'absolute',
                      left: '-24px',
                      top: '2px',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      backgroundColor: '#ffffff',
                      border: `2px solid ${event.color}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: event.color }} />
                    </div>
                    
                    {/* Conteúdo */}
                    <div>
                      <p style={{ color: '#1c1917', fontSize: '14px', fontWeight: '600', margin: '0 0 4px 0' }}>
                        {event.action}
                      </p>
                      <p style={{ color: '#a8a29e', fontSize: '12px', margin: '0' }}>
                        {event.user} • {event.timestamp}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
