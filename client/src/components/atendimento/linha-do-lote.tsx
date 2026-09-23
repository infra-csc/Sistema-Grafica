// ─────────────────────────────────────────────────────────────────────────────
// UMA LINHA DO PAINEL DE LOTE — a peça elegível, a caixinha e a miniatura.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { AlertCircle, Eye, Package } from "lucide-react";
import { SeloKit } from "@/components/kit/selo-kit";
import { miniatura } from "@/lib/miniatura";
import { T, N, TOM, FONT } from "@/lib/theme";
import { aoFalharMiniatura } from "./regras";
import type { PecaAtendimento } from "./tipos";

export function LinhaDoLote({ item, batchSelectedItemIds, setBatchSelectedItemIds, setBatchPreviewItem }: {
  item: PecaAtendimento;
  batchSelectedItemIds: Set<string>;
  setBatchSelectedItemIds: Dispatch<SetStateAction<Set<string>>>;
  setBatchPreviewItem: Dispatch<SetStateAction<PecaAtendimento | null>>;
}) {
  const isChecked = batchSelectedItemIds.has(item.id);
  const hasThumb = !!item.approvalThumbUrl;
  return (
    <div
      data-testid={`batch-item-row-${item.id}`}
      onClick={() => setBatchSelectedItemIds(prev => {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      })}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px',
        backgroundColor: isChecked ? TOM.laranja.bg : T.surface,
        border: `1.5px solid ${isChecked ? TOM.laranja.dot : N.n3}`,
        borderRadius: 12, cursor: 'pointer',
        transition: 'border-color 0.12s, background-color 0.12s',
      }}
    >
      <input
        type="checkbox"
        checked={isChecked}
        data-testid={`checkbox-batch-item-${item.id}`}
        // O clique no checkbox NÃO pode subir para o card: o card
        // também alterna, e os dois toggles se anulavam — por isso
        // clicar na caixinha parecia não desmarcar.
        onClick={e => e.stopPropagation()}
        onChange={() => setBatchSelectedItemIds(prev => {
          const next = new Set(prev);
          if (next.has(item.id)) next.delete(item.id);
          else next.add(item.id);
          return next;
        })}
        style={{ accentColor: T.accentText, width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }}
      />
      {/* Thumbnail — clique abre a arte em tamanho grande */}
      <div
        onClick={e => { if (hasThumb) { e.stopPropagation(); setBatchPreviewItem(item); } }}
        data-testid={`batch-thumb-${item.id}`}
        title={hasThumb ? 'Clique para ver a arte' : 'Sem arte enviada'}
        className={hasThumb ? 'group' : undefined}
        style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: hasThumb ? N.n3 : N.n2, flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${hasThumb ? 'rgba(0,0,0,0.06)' : T.border}`, position: 'relative', cursor: hasThumb ? 'zoom-in' : 'default' }}
      >
        {hasThumb ? (
          <>
            <img
              src={miniatura(item.approvalThumbUrl)}
              alt=""
              loading="lazy"
              decoding="async"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={aoFalharMiniatura}
            />
            <div data-fallback="1" style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', background: N.n2, flexDirection: 'column', gap: 2 }}>
              <Package style={{ width: 16, height: 16, color: T.bdark }} />
              <span style={{ fontSize: 11, color: T.second, fontWeight: 600, letterSpacing: '0.03em' }}>SEM ARTE</span>
            </div>
            <span
              style={{ position: 'absolute', inset: 0, background: 'rgba(28,25,23,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.12s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0'}
            >
              <Eye style={{ width: 16, height: 16, color: T.surface }} />
            </span>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <Package style={{ width: 18, height: 18, color: T.bdark }} />
            <span style={{ fontSize: 11, color: T.second, fontWeight: 600, letterSpacing: '0.03em' }}>SEM ARTE</span>
          </div>
        )}
      </div>
      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          {/* Código em cinza mono, como no card da fila: o selo
              laranja repetido em cada linha do lote gastava a
              cor de atenção num dado que só identifica. */}
          <span style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 700, color: T.second, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
            {item.displayId}
          </span>
          <SeloKit peca={item} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.type}
          </span>
        </div>
        {item.description && (
          <p style={{ fontSize: 11, color: T.second, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.description}
          </p>
        )}
      </div>
      {/* Só o que PEDE atenção: "Sem arte". O selo verde
          "Arte OK" em toda linha com arte era a regra, não a
          exceção — e a miniatura ao lado já mostra a arte. */}
      {!hasThumb && (
        <div style={{ flexShrink: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: TOM.alerta.text, fontWeight: 700, background: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: 999, padding: '2px 8px' }}>
            <AlertCircle aria-hidden="true" style={{ width: 11, height: 11 }} /> Sem arte
          </span>
        </div>
      )}
    </div>
  );
}
