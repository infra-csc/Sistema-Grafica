// As ações do evento — o MESMO componente no cartão e na linha, para um botão
// novo nascer nos dois lugares.
import { Flag, Copy, Pencil, Building2, Lock, Unlock, Trash2 } from "lucide-react";
import { T, R, SHADOW, TOM } from "@/lib/theme";
import { alvo, usePonteiroGrosso } from "@/hooks/use-mobile";
import type { AcaoSobreEvento, EventoDaLista } from "./tipos";

export function EventCardActions({
  event,
  accentHex,
  onEdit,
  onDelete,
  onDuplicate,
  onSetPriority,
  onClose,
  onReopen,
  canEdit,
  soPatrocinadores = false,
  canDelete,
  canDuplicate,
  canSetPriority,
  canClose,
  isClosed,
  isMobile,
}: {
  event: EventoDaLista;
  accentHex: string;
  onEdit: AcaoSobreEvento;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onDuplicate: AcaoSobreEvento;
  onSetPriority: AcaoSobreEvento;
  onClose: AcaoSobreEvento;
  onReopen: AcaoSobreEvento;
  canEdit: boolean;
  /** Sem editar o evento: o lápis vira "Vincular patrocinadores". */
  soPatrocinadores?: boolean;
  canDelete: boolean;
  canDuplicate: boolean;
  canSetPriority: boolean;
  canClose: boolean;
  isClosed: boolean;
  isMobile?: boolean;
}) {
  // Alvo de toque pelo PONTEIRO, não pela largura: o tablet do galpão tem
  // 1024px de janela e é operado com o dedo — ficava nos 32px do mouse.
  const dedo = usePonteiroGrosso() || !!isMobile;
  const btnBase: React.CSSProperties = {
    minWidth: alvo(32, dedo),
    minHeight: alvo(32, dedo),
    padding: '8px',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: R.md,
    cursor: 'pointer',
    display: 'flex',
    boxShadow: SHADOW.sm,
  };
  return (
    <div
      // `[@media(hover:none)]`: tablet e notebook de toque passam de 768px
      // (então `isMobile` é falso) e NÃO têm hover — as ações ficavam
      // invisíveis para sempre nesses aparelhos.
      className={isMobile ? "focus-within:opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100"}
      style={{ display: 'flex', gap: '6px', transition: 'opacity 0.2s', flexShrink: 0 }}
      onClick={(e) => { e.stopPropagation(); }}
    >
      {/* canSetPriority espelha o gate do servidor (admin/atendimento/solicitacao).
          A bandeira só some no evento CONCLUÍDO de verdade — antes ela sumia
          por data, e a prioridade do evento problemático virava inalterável. */}
      {canSetPriority && (
        <button
          onClick={(e) => onSetPriority(event, e)}
          title="Definir prioridade"
          aria-label={`Definir prioridade de ${event.name}`}
          data-testid={`button-priority-event-${event.id}`}
          style={{ ...btnBase, backgroundColor: T.bg, color: event.priority ? accentHex : T.second }}
        >
          <Flag style={{ width: '13px', height: '13px', fill: event.priority ? accentHex : 'none' }} />
        </button>
      )}
      {canDuplicate && (
        <button onClick={(e) => onDuplicate(event, e)} data-testid={`button-duplicate-event-${event.id}`}
          title="Duplicar evento (prazos, patrocinadores e cotas)" aria-label={`Duplicar evento ${event.name}`}
          style={{ ...btnBase, backgroundColor: T.bg, color: T.second }}>
          <Copy style={{ width: '13px', height: '13px' }} />
        </button>
      )}
      {canEdit ? (
        <button onClick={(e) => onEdit(event, e)} data-testid={`button-edit-event-${event.id}`}
          title="Editar evento" aria-label={`Editar evento ${event.name}`}
          style={{ ...btnBase, backgroundColor: T.bg, color: T.second }}>
          <Pencil style={{ width: '13px', height: '13px' }} />
        </button>
      ) : soPatrocinadores && (
        <button onClick={(e) => onEdit(event, e)} data-testid={`button-sponsors-event-${event.id}`}
          title="Vincular patrocinadores" aria-label={`Vincular patrocinadores ao evento ${event.name}`}
          style={{ ...btnBase, backgroundColor: T.bg, color: T.second }}>
          <Building2 style={{ width: '13px', height: '13px' }} />
        </button>
      )}
      {/* Encerrar / Reabrir — o mesmo lugar no card, porque são a mesma
          decisão nas duas direções. Só admin (ver gate do servidor). */}
      {canClose && (
        isClosed ? (
          <button onClick={(e) => onReopen(event, e)} data-testid={`button-reopen-event-${event.id}`}
            title="Reabrir evento" aria-label={`Reabrir evento ${event.name}`}
            style={{ ...btnBase, backgroundColor: TOM.sucesso.bg, color: TOM.sucesso.text }}>
            <Unlock style={{ width: '13px', height: '13px' }} />
          </button>
        ) : (
          <button onClick={(e) => onClose(event, e)} data-testid={`button-close-event-${event.id}`}
            title="Encerrar evento" aria-label={`Encerrar evento ${event.name}`}
            style={{ ...btnBase, backgroundColor: T.bg, color: T.apoio }}>
            <Lock style={{ width: '13px', height: '13px' }} />
          </button>
        )
      )}
      {canDelete && (
        <button onClick={(e) => onDelete(event.id, e)} data-testid={`button-delete-event-${event.id}`}
          title="Excluir evento" aria-label={`Excluir evento ${event.name}`}
          style={{ ...btnBase, backgroundColor: TOM.perigo.bg, color: TOM.perigo.text }}>
          <Trash2 style={{ width: '13px', height: '13px' }} />
        </button>
      )}
    </div>
  );
}
