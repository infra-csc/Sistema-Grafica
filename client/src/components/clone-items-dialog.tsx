import { ChevronDown, Copy, Loader2 } from "lucide-react";
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
  /** A lista de eventos só é buscada quando o dialog abre — sem esta flag o
   *  select parecia vazio ("— Escolha um evento —") enquanto carregava. */
  eventsLoading?: boolean;
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
  eventsLoading = false,
  cloneSourceId,
  setCloneSourceId,
  isCloning,
  onConfirmClone,
}: CloneItemsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onOpenChange(false); setCloneSourceId(""); } }}>
      <DialogContent
        // ALTURA: cabeçalho 90 + corpo ~200 (rótulo, o select e a tarja "O que
        // será copiado", que só aparece depois da escolha) + rodapé 80 = ~370px,
        // contra 397 disponíveis numa janela de 445 — este modal NÃO cortava,
        // mas por 27px, e a lista de eventos do select não muda essa conta.
        // O teto de `100vh − 48` (viewport menos 24 de respiro em cima e 24
        // embaixo, simétrico porque o Radix centra) entra com a coluna flex
        // porque o `overflow: hidden` daqui recortaria em silêncio numa janela
        // menor: sem scrollport não há como alcançar o que passou.
        style={{ maxWidth: 520, padding: 0, gap: 0, borderRadius: 12, overflow: 'hidden', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid #f0efed', flexShrink: 0 }}>
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

        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>
            Selecionar evento de origem
          </label>
          {/* Wrapper relativo para a seta: o appearance:none tirou o chevron
              nativo e o select parecia um input travado. */}
          <div style={{ position: 'relative' }}>
            <select
              value={cloneSourceId}
              onChange={e => setCloneSourceId(e.target.value)}
              disabled={eventsLoading}
              data-testid="select-clone-source"
              style={{
                width: '100%', padding: '10px 36px 10px 14px', borderRadius: 8, border: '1.5px solid #e7e5e4',
                fontSize: 15, fontFamily: "'Space Grotesk', sans-serif", color: eventsLoading ? '#746e69' : '#1a1c1c',
                backgroundColor: '#ffffff', appearance: 'none', cursor: eventsLoading ? 'wait' : 'pointer',
              }}
            >
              {eventsLoading ? (
                <option value="">Carregando eventos…</option>
              ) : (
                <>
                  <option value="">— Escolha um evento —</option>
                  {allEvents
                    .filter((e: any) => e.id !== eventId)
                    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((e: any) => (
                      <option key={e.id} value={e.id}>
                        {e.name} {e.startDate ? `(${new Date(e.startDate).toLocaleDateString('pt-BR')})` : ''}
                      </option>
                    ))}
                </>
              )}
            </select>
            {eventsLoading ? (
              <Loader2 className="animate-spin" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#746e69', pointerEvents: 'none' }} />
            ) : (
              <ChevronDown style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#746e69', pointerEvents: 'none' }} />
            )}
          </div>

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

        <div style={{ flexShrink: 0, padding: '16px 28px 24px', borderTop: '1px solid #f0efed', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
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
