import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { Calendar, ClipboardList, Package, Building2, FileText, History, Edit, Save, X } from "lucide-react";
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
              <h2 style={{ color: '#1c1917', fontSize: '18px', fontWeight: '700', margin: '0 0 4px 0' }}>
                {item.displayId} • {item.event?.name}
              </h2>
              <p style={{ color: '#a8a29e', fontSize: '13px', margin: '0' }}>
                {item.event?.startDate && format(new Date(item.event.startDate), "MMMM d, yyyy", { locale: ptBR })}
              </p>
            </div>
            <Button size="icon" variant="ghost" onClick={() => onOpenChange(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Timeline Horizontal */}
        <div style={{ 
          padding: '20px 24px',
          borderBottom: '1px solid #e7e5e4',
          overflowX: 'auto'
        }}>
          <div style={{ display: 'flex', gap: '16px', minWidth: 'fit-content', alignItems: 'center' }}>
            {[
              { label: 'Criado', status: 'created' },
              { label: 'Em Aprovação', status: 'em_aprovacao' },
              { label: 'Aprovado', status: 'approved' },
              { label: 'Pronto', status: 'ready' },
              { label: 'Aguardando Revisão Final', status: 'aguardando_revisao_final' }
            ].map((step, idx) => {
              const isActive = item.status === step.status || 
                (item.status === 'aguardando_revisao_final' && step.status === 'aguardando_revisao_final');
              return (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Badge 
                    style={{
                      backgroundColor: isActive ? '#f97316' : '#ffffff',
                      color: isActive ? '#ffffff' : '#1c1917',
                      border: isActive ? '1px solid #f97316' : '1px solid #e7e5e4',
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontWeight: '600',
                      whiteSpace: 'nowrap',
                      borderRadius: '6px'
                    }}
                  >
                    {step.label}
                  </Badge>
                  {idx < 4 && (
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: isActive ? '#f97316' : '#e7e5e4'
                    }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
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

          {/* Grid: Evento + Especificações */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Evento */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Calendar className="h-5 w-5" style={{ color: '#f97316' }} />
                <h3 style={{ color: '#1c1917', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', margin: '0', letterSpacing: '0.5px' }}>
                  Evento
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ color: '#a8a29e', fontSize: '12px' }}>Nome</span>
                  <span style={{ color: '#1c1917', fontWeight: '600', fontSize: '13px', textAlign: 'right' }}>{item.event?.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ color: '#a8a29e', fontSize: '12px' }}>Data</span>
                  <span style={{ color: '#1c1917', fontWeight: '600', fontSize: '13px' }}>
                    {item.event?.startDate ? format(new Date(item.event.startDate), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ color: '#a8a29e', fontSize: '12px' }}>Saída</span>
                  <span style={{ color: '#1c1917', fontWeight: '600', fontSize: '13px' }}>
                    {item.event?.truckDepartureDate ? format(new Date(item.event.truckDepartureDate), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Especificações */}
            <div>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ color: '#a8a29e', fontSize: '12px' }}>Tipo</span>
                    <span style={{ color: '#1c1917', fontWeight: '600', fontSize: '13px' }}>{item.type || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ color: '#a8a29e', fontSize: '12px' }}>Material</span>
                    <span style={{ color: '#1c1917', fontWeight: '600', fontSize: '13px' }}>{item.material || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ color: '#a8a29e', fontSize: '12px' }}>Acabamento</span>
                    <span style={{ color: '#1c1917', fontWeight: '600', fontSize: '13px' }}>{item.finish || '—'}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Dados de Produção - Tabela Simplificada */}
          <div>
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
                    width: '30%',
                    backgroundColor: '#fafaf9'
                  }}>
                    QUANTIDADE
                  </td>
                  <td style={{ 
                    padding: '12px 16px',
                    borderLeft: '4px solid #f97316',
                    color: '#1c1917',
                    fontSize: '14px',
                    fontWeight: '700',
                    backgroundColor: '#fafaf9'
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
                    borderBottom: '1px solid #e7e5e4'
                  }}>
                    M² TOTAL
                  </td>
                  <td style={{ 
                    padding: '12px 16px',
                    color: '#1c1917',
                    fontSize: '14px',
                    fontWeight: '600',
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
                
                {/* Medida */}
                <tr>
                  <td style={{ 
                    padding: '12px 16px',
                    color: '#a8a29e',
                    fontSize: '12px',
                    fontWeight: '600',
                    width: '30%'
                  }}>
                    MEDIDA
                  </td>
                  <td style={{ 
                    padding: '12px 16px',
                    color: '#1c1917',
                    fontSize: '13px',
                    fontWeight: '600'
                  }}>
                    {item.measurement || '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

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
                      backgroundColor: '#ffffff',
                      border: '1px solid #e7e5e4',
                      color: '#1c1917',
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

          {/* Histórico - Timeline Vertical */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <History className="h-5 w-5" style={{ color: '#f97316' }} />
              <h3 style={{ color: '#1c1917', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', margin: '0', letterSpacing: '0.5px' }}>
                Histórico
              </h3>
            </div>
            
            {/* Timeline Vertical */}
            <div style={{ position: 'relative', paddingLeft: '28px' }}>
              {/* Linha vertical */}
              <div style={{ 
                position: 'absolute',
                left: '6px',
                top: '0',
                bottom: '0',
                width: '1px',
                backgroundColor: '#e7e5e4'
              }} />
              
              {/* Eventos */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {mockHistory.map((event, idx) => {
                  const isLast = idx === mockHistory.length - 1;
                  return (
                    <div key={idx} style={{ position: 'relative' }}>
                      {/* Ponto */}
                      <div style={{ 
                        position: 'absolute',
                        left: '-22px',
                        top: '2px',
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: '#ffffff',
                        border: `2px solid ${isLast ? '#f97316' : '#a8a29e'}`
                      }} />
                      
                      {/* Conteúdo */}
                      <p style={{ color: '#1c1917', fontSize: '13px', fontWeight: '600', margin: '0 0 2px 0' }}>
                        {event.action}
                      </p>
                      <p style={{ color: '#a8a29e', fontSize: '12px', margin: '0' }}>
                        {event.timestamp}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
