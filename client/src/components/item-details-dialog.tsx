import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import { CommentsSection } from "@/components/comments-section";
import { CheckCircle2, CircleDot, Circle, Calendar, ClipboardList, Package, Building2, FileText, History, Edit, Save } from "lucide-react";
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

const titaniumStyles = {
  dialogBg: '#23272E',
  cardBg: '#2D323B',
  headerBg: 'rgba(45, 50, 59, 0.5)',
  accentCyan: '#00D9FF',
  textPrimary: '#F0F4F8',
  textSecondary: '#909CB0',
  border: 'rgba(255, 255, 255, 0.08)',
  borderLight: 'rgba(255, 255, 255, 0.05)',
};

const CardSection = ({ icon: Icon, title, children }: any) => (
  <div style={{ 
    backgroundColor: titaniumStyles.cardBg, 
    border: `1px solid ${titaniumStyles.border}`,
    borderRadius: '12px',
    overflow: 'hidden'
  }}>
    <div style={{ 
      backgroundColor: 'rgba(0, 217, 255, 0.05)', 
      borderBottom: `1px solid ${titaniumStyles.border}`,
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }}>
      <Icon className="h-4 w-4" style={{ color: titaniumStyles.accentCyan }} />
      <span style={{ color: titaniumStyles.textSecondary, fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        {title}
      </span>
    </div>
    <div style={{ padding: '16px' }}>
      {children}
    </div>
  </div>
);

const DataRow = ({ label, value }: any) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingY: '8px', borderBottom: `1px solid ${titaniumStyles.borderLight}` }}>
    <span style={{ color: titaniumStyles.textSecondary, fontSize: '12px' }}>{label}</span>
    <span style={{ color: titaniumStyles.textPrimary, fontWeight: '500' }}>{value || '—'}</span>
  </div>
);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-6xl max-h-[90vh] overflow-y-auto" 
        style={{ 
          backgroundColor: titaniumStyles.dialogBg,
          border: `1px solid ${titaniumStyles.border}`,
          backdropFilter: 'blur(8px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
        }}
      >
        {/* Header */}
        <div style={{ 
          backgroundColor: titaniumStyles.headerBg, 
          borderBottom: `1px solid ${titaniumStyles.border}`,
          padding: '20px',
          backdropFilter: 'blur(4px)',
          marginBottom: '24px'
        }}>
          <div className="space-y-3">
            <div className="flex items-baseline gap-3">
              <span style={{ fontSize: '24px', fontWeight: '700', color: titaniumStyles.accentCyan, fontFamily: 'monospace', letterSpacing: '2px' }}>
                {item.displayId}
              </span>
              <p style={{ fontSize: '11px', color: titaniumStyles.textSecondary, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: '600' }}>
                Detalhes do Item
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={item.status} />
              {item.rejectedBySponsor && (
                <Badge variant="outline" className="text-xs border-red-500/50 bg-red-500/10 text-red-400">
                  Reprovado Patrocinador
                </Badge>
              )}
              {item.rejectedByCreator && (
                <Badge variant="outline" className="text-xs border-orange-500/50 bg-orange-500/10 text-orange-400">
                  Reprovado Criador
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6 px-6">
          {/* Progresso Timeline */}
          <div style={{ 
            backgroundColor: titaniumStyles.cardBg, 
            border: `1px solid ${titaniumStyles.border}`,
            borderRadius: '12px',
            padding: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <ClipboardList className="h-4 w-4" style={{ color: titaniumStyles.accentCyan }} />
              <span style={{ color: titaniumStyles.textSecondary, fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Progresso
              </span>
            </div>
            <div className="flex items-center justify-between text-xs gap-2">
              {['Vinculação', 'Arte', 'Aprovação', 'Finalização', 'Revisão', 'Produção'].map((label, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1 flex-1">
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: titaniumStyles.border, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Circle className="h-3 w-3" style={{ color: titaniumStyles.textSecondary }} />
                  </div>
                  <span style={{ color: titaniumStyles.textSecondary, fontSize: '10px', textAlign: 'center' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Custom Actions */}
          {customActions && (
            <div style={{ 
              backgroundColor: titaniumStyles.cardBg, 
              border: `1px solid ${titaniumStyles.border}`,
              borderRadius: '12px',
              padding: '16px'
            }}>
              {customActions}
            </div>
          )}

          {/* Top Actions */}
          {topActions && <div className="space-y-3">{topActions}</div>}

          {/* Grid: Evento + Especificações */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Evento */}
            <CardSection icon={Calendar} title="Evento">
              <DataRow label="Nome" value={item.event?.name} />
              <DataRow label="Data" value={item.event?.startDate ? format(new Date(item.event.startDate), "dd/MM/yyyy", { locale: ptBR }) : null} />
              <DataRow label="Saída" value={item.event?.truckDepartureDate ? format(new Date(item.event.truckDepartureDate), "dd/MM/yyyy HH:mm", { locale: ptBR }) : null} />
            </CardSection>

            {/* Especificações */}
            <CardSection icon={ClipboardList} title="Especificações">
              {editMode ? (
                <div className="space-y-3">
                  <div>
                    <label style={{ color: titaniumStyles.textSecondary, fontSize: '12px' }}>Tipo</label>
                    <Input
                      value={editedItem?.type || ""}
                      onChange={(e) => handleEditChange("type", e.target.value)}
                      style={{ backgroundColor: titaniumStyles.headerBg, border: `1px solid ${titaniumStyles.border}`, color: titaniumStyles.textPrimary }}
                      className="text-sm mt-1"
                    />
                  </div>
                  <div>
                    <label style={{ color: titaniumStyles.textSecondary, fontSize: '12px' }}>Material</label>
                    <Input
                      value={editedItem?.material || ""}
                      onChange={(e) => handleEditChange("material", e.target.value)}
                      style={{ backgroundColor: titaniumStyles.headerBg, border: `1px solid ${titaniumStyles.border}`, color: titaniumStyles.textPrimary }}
                      className="text-sm mt-1"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>Cancelar</Button>
                    <Button size="sm" onClick={handleSaveEdits}><Save className="h-3 w-3 mr-1" /> Salvar</Button>
                  </div>
                </div>
              ) : (
                <>
                  <DataRow label="Tipo" value={item.type} />
                  <DataRow label="Material" value={item.material} />
                  <DataRow label="Acabamento" value={item.finish} />
                </>
              )}
              {!editMode && (
                <Button size="icon" variant="ghost" onClick={() => { setEditedItem(item); setEditMode(true); }} className="mt-2">
                  <Edit className="h-3 w-3" />
                </Button>
              )}
            </CardSection>
          </div>

          {/* Dados de Produção - Grid técnico */}
          <CardSection icon={Package} title="Dados de Produção">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div style={{ padding: '12px', backgroundColor: titaniumStyles.headerBg, borderRadius: '8px', border: `1px solid ${titaniumStyles.border}` }}>
                <p style={{ color: titaniumStyles.textSecondary, fontSize: '11px', marginBottom: '4px' }}>Quantidade</p>
                <p style={{ color: titaniumStyles.textPrimary, fontSize: '18px', fontWeight: '700' }}>{item.quantity || 0}</p>
              </div>
              <div style={{ padding: '12px', backgroundColor: titaniumStyles.headerBg, borderRadius: '8px', border: `1px solid ${titaniumStyles.border}` }}>
                <p style={{ color: titaniumStyles.textSecondary, fontSize: '11px', marginBottom: '4px' }}>m² Total</p>
                <p style={{ color: titaniumStyles.accentCyan, fontSize: '18px', fontWeight: '700' }}>{item.calculatedM2 || 0}</p>
              </div>
              <div style={{ padding: '12px', backgroundColor: titaniumStyles.headerBg, borderRadius: '8px', border: `1px solid ${titaniumStyles.border}` }}>
                <p style={{ color: titaniumStyles.textSecondary, fontSize: '11px', marginBottom: '4px' }}>Visual</p>
                <p style={{ color: titaniumStyles.textPrimary, fontSize: '14px', fontWeight: '600' }}>{item.visualWidth} × {item.visualHeight || '—'}</p>
              </div>
              <div style={{ padding: '12px', backgroundColor: titaniumStyles.headerBg, borderRadius: '8px', border: `1px solid ${titaniumStyles.border}` }}>
                <p style={{ color: titaniumStyles.textSecondary, fontSize: '11px', marginBottom: '4px' }}>Medida</p>
                <p style={{ color: titaniumStyles.textPrimary, fontSize: '14px', fontWeight: '600' }}>{item.measurement || '—'}</p>
              </div>
            </div>
          </CardSection>

          {/* Patrocinadores */}
          {item.sponsors && item.sponsors.length > 0 && (
            <CardSection icon={Building2} title={`Patrocinadores (${item.sponsors.length})`}>
              <div className="flex flex-wrap gap-2">
                {item.sponsors.map((sponsor: any) => (
                  <Badge key={sponsor.id} style={{ backgroundColor: 'rgba(0, 217, 255, 0.1)', border: `1px solid ${titaniumStyles.accentCyan}`, color: titaniumStyles.accentCyan }}>
                    {sponsor.name}
                  </Badge>
                ))}
              </div>
            </CardSection>
          )}

          {/* Observações */}
          {item.observations && (
            <CardSection icon={FileText} title="Observações">
              <p style={{ color: titaniumStyles.textPrimary, fontSize: '14px', whiteSpace: 'pre-wrap' }}>{item.observations}</p>
            </CardSection>
          )}

          {/* Histórico */}
          {auditLogs && auditLogs.length > 0 && (
            <CardSection icon={History} title="Histórico">
              <div className="space-y-2">
                {auditLogs.filter((log: any) => log.entityId === item.id).slice(0, 5).map((log: any, idx: number) => (
                  <div key={idx} style={{ paddingY: '8px', borderBottom: `1px solid ${titaniumStyles.borderLight}` }}>
                    <p style={{ color: titaniumStyles.textSecondary, fontSize: '12px' }}>{log.action}</p>
                    <p style={{ color: titaniumStyles.textSecondary, fontSize: '11px' }}>
                      {log.user} • {log.timestamp ? format(new Date(log.timestamp), "dd/MM HH:mm") : '—'}
                    </p>
                  </div>
                ))}
              </div>
            </CardSection>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
