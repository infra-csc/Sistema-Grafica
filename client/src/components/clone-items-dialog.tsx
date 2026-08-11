import { Copy, Loader2 } from "lucide-react";
import { getStatusLabel } from "@/lib/status";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

interface CloneItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string | undefined;
  eventName: string | undefined;
  allEvents: any[];
  cloneSourceId: string;
  setCloneSourceId: (id: string) => void;
  isCloning: boolean;
  onConfirmClone: () => void;
}

// Extracted from event-detail.tsx: "Clonar Peças de Outro Evento" dialog.
// Pure presentational split — no business logic changed, only relocated.
export function CloneItemsDialog({
  open,
  onOpenChange,
  eventId,
  eventName,
  allEvents,
  cloneSourceId,
  setCloneSourceId,
  isCloning,
  onConfirmClone,
}: CloneItemsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onOpenChange(false); setCloneSourceId(""); } }}>
      <DialogContent style={{ maxWidth: 520, padding: 0, gap: 0, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid #f0efed' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Copy style={{ width: 18, height: 18, color: '#6366f1' }} />
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: '-0.03em', color: '#1a1c1c', margin: 0 }}>
              Clonar Peças de Outro Evento
            </DialogTitle>
          </div>
          <DialogDescription style={{ fontSize: 13, color: '#746e69', margin: 0, paddingLeft: 28 }}>
            Copia todos os itens de um evento anterior para este evento
          </DialogDescription>
        </div>

        <div style={{ padding: '24px 28px' }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>
            Selecionar evento de origem
          </label>
          <select
            value={cloneSourceId}
            onChange={e => setCloneSourceId(e.target.value)}
            data-testid="select-clone-source"
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #e7e5e4',
              fontSize: 15, fontFamily: "'Space Grotesk', sans-serif", color: '#1a1c1c',
              backgroundColor: '#ffffff', appearance: 'none', cursor: 'pointer',
             
            }}
          >
            <option value="">— Escolha um evento —</option>
            {allEvents
              .filter((e: any) => e.id !== eventId)
              .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((e: any) => (
                <option key={e.id} value={e.id}>
                  {e.name} {e.startDate ? `(${new Date(e.startDate).toLocaleDateString('pt-BR')})` : ''}
                </option>
              ))}
          </select>

          {cloneSourceId && (
            <div style={{ marginTop: 16, backgroundColor: '#f0f0ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '12px 14px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Copy style={{ width: 14, height: 14, color: '#6366f1', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#3730a3', margin: '0 0 2px' }}>O que será copiado</p>
                <p style={{ fontSize: 11, color: '#4338ca', margin: 0, lineHeight: 1.5 }}>
                  Todos os itens do evento selecionado serão adicionados a <strong>{eventName}</strong>.<br />
                  Status: <strong>{getStatusLabel("requested")}</strong> · Patrocinadores e aprovações <strong>não</strong> serão copiados.
                </p>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '16px 28px 24px', borderTop: '1px solid #f0efed', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button variant="outline" onClick={() => { onOpenChange(false); setCloneSourceId(""); }}>
            Cancelar
          </Button>
          <Button
            onClick={onConfirmClone}
            disabled={!cloneSourceId || isCloning}
            data-testid="button-confirm-clone"
            style={{ backgroundColor: '#4f46e5', color: '#ffffff' }}
          >
            {isCloning ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Clonando...</>
            ) : (
              <><Copy className="h-4 w-4 mr-2" /> Clonar Peças</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
